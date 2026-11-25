import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { PerspectiveCamera } from 'three';
import type { Director } from '../sim/director';
import { useWaker } from './motion';
import { angleDelta } from '../sim/paths';
import { DEFAULT_VIEW, TIER_DISTANCE, WIDE_VIEW, clampToSite, closeDistance, siteHeading, sitePx, tierOf } from '../world/layout';
import type { ViewPreset, ViewTier } from '../world/layout';

// 스튜디오 카메라. 거리는 세 단계(wide 부지 전체 / mid 한 구역 / close 대상 하나)이고 그 사이를 부드럽게 미끄러져 간다.
// 끌어서 이동, 휠·핀치로 확대, 오른쪽 버튼(또는 Shift)으로 회전한다. 고른 대상은 close 거리에서 계속 따라간다.
// 처음에는 부지 전체(wide)에서 시작해 기본 구역(mid)으로 들어온다.
// 카메라는 월드 시계와 무관하다: 연결이 끊겨 장면이 멈춰도 둘러볼 수 있다.

export interface RigApi {
  view(preset: ViewPreset): void;
  /** 미끄러지지 않고 바로 그 보기로 옮긴다 (점검 스크립트의 스크린샷용) */
  jump(preset: ViewPreset): void;
  /** 카메라가 목표에서 얼마나 떨어져 있는지 (0에 가까우면 멈춰 섰다. 깨우개와 같은 값) */
  error(): number;
  /** 거리 단계를 한 칸 옮긴다 (+1 가까이, -1 멀리). 지역 프리셋이 바뀌면 그 프리셋을 돌려준다 */
  zoom(dir: 1 | -1): ViewPreset | null;
  /** 방위각을 돌린다 (도) */
  rotate(deg: number): void;
}

const TIERS: readonly ViewTier[] = ['wide', 'mid', 'close'];

export interface RigProps {
  director: Director;
  /** 따라갈 대상 (없으면 마지막 지역 보기로 돌아간다) */
  focusKey: string | null;
  api: MutableRefObject<RigApi | null>;
  /** 패널이 가리는 화면 가장자리(px). 그만큼 비켜서 대상을 잡는다 */
  inset: { right: number; bottom: number; top: number };
}

interface View {
  x: number;
  y: number;
  z: number;
  dist: number;
  az: number;
  pol: number;
  fov: number;
}

const DEG = Math.PI / 180;
/** 기본 세로 화각(도). Stage의 카메라와 같다 */
const BASE_FOV = 20;
const MIN_DIST = 11;
const MAX_DIST = 150;
const MIN_POL = 24;
const MAX_POL = 74;
const GLIDE = 2.3;
/** 손가락·마우스로 끄는 동안의 따라오는 속도: 느슨하면 손이 움직인 만큼 화면이 따라오지 않고 미끄러진다 */
const DRAG_GLIDE = 22;
/** 대상을 볼 때의 천정각 */
const FOCUS_POLAR = 52;

/** 프리셋 거리는 이 가로세로 비(패널을 뺀 빈 영역)에 맞춘 값이다. 더 좁은 화면에서는 그만큼 물러난다 */
const REFERENCE_ASPECT = (1440 - 320) / 900;

/** 사진처럼 남쪽에서 북쪽을 보는 카메라 방위각(도): 프리셋의 azimuth는 이 값에서 잰다 */
const SOUTH_AZ = (siteHeading(0, 1) * 180) / Math.PI;

/** 프리셋(사진 좌표) → 카메라 목표(월드). 사진 → 월드 변환은 world/layout의 sitePx 하나만 쓴다 */
const fromPreset = (p: ViewPreset): View => {
  const [x, z] = sitePx(p.at[0], p.at[1]);
  return { x, y: p.height, z, dist: p.distance, az: SOUTH_AZ + p.azimuth, pol: p.polar, fov: p.fov ?? BASE_FOV };
};

/** 안개 기본 범위 (Stage의 fog와 같다) */
const FOG_NEAR = 170;
const FOG_FAR = 380;

/** 카메라가 목표에 닿았다고 보는 오차 */
const SETTLED = 0.003;
const viewError = (g: View, c: View): number =>
  Math.abs(g.x - c.x) + Math.abs(g.y - c.y) + Math.abs(g.z - c.z) + Math.abs(g.dist - c.dist) * 0.2 + Math.abs(g.pol - c.pol) * 0.05 + Math.abs(angleDelta(c.az * DEG, g.az * DEG)) + Math.abs(g.fov - c.fov) * 0.05;

export function Rig({ director, focusKey, api, inset }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const home = useRef<ViewPreset>(DEFAULT_VIEW);
  const goal = useRef<View>(fromPreset(DEFAULT_VIEW));
  // 처음에는 부지 전체(wide)에서 시작해 기본 구역(mid)으로 미끄러져 들어온다
  const cur = useRef<View>({ ...fromPreset(WIDE_VIEW), az: WIDE_VIEW.azimuth - 14 });
  const follow = useRef(false);
  const anchor = useRef({ x: 0, y: 0, z: 0 });
  const insetRef = useRef(inset);
  insetRef.current = inset;

  useEffect(() => {
    api.current = {
      view(preset) {
        home.current = preset;
        follow.current = false;
        goal.current = fromPreset(preset);
      },
      zoom(dir) {
        const g = goal.current;
        const tier = tierOf(g.dist);
        const next = TIERS[TIERS.indexOf(tier) + dir];
        if (!next) {
          // 끝 단계에서는 조금씩만 더 움직인다
          g.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, g.dist * (dir > 0 ? 0.82 : 1.2)));
          return null;
        }
        if (next === 'wide' || tier === 'wide') {
          const preset = next === 'wide' ? WIDE_VIEW : home.current.tier === 'wide' ? DEFAULT_VIEW : home.current;
          this.view(preset);
          return preset;
        }
        g.dist = TIER_DISTANCE[next];
        return null;
      },
      rotate(deg) {
        goal.current.az += deg;
      },
      jump(preset) {
        this.view(preset);
        cur.current = { ...goal.current };
        invalidate();
      },
      error() {
        return viewError(goal.current, cur.current);
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, invalidate]);

  useEffect(() => {
    if (!focusKey) {
      follow.current = false;
      goal.current = fromPreset(home.current);
      return;
    }
    follow.current = true;
    goal.current.dist = closeDistance(focusKey);
    goal.current.pol = FOCUS_POLAR;
    goal.current.fov = BASE_FOV;
  }, [focusKey]);

  const touching = useRef(false);
  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let rotating = false;

    const unitsPerPx = () => (2 * cur.current.dist * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, el.clientHeight);

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      touching.current = true;
      rotating = e.button === 2 || e.shiftKey || e.ctrlKey;
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const g = goal.current;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0 && d > 0) g.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, (g.dist * pinch) / d));
        pinch = d;
        return;
      }
      if (rotating) {
        g.az += dx * 0.28;
        g.pol = Math.min(MAX_POL, Math.max(MIN_POL, g.pol - dy * 0.22));
        return;
      }
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      follow.current = false;
      const a = cur.current.az * DEG;
      const upp = unitsPerPx();
      const fwd = (dy * upp) / Math.max(0.3, Math.cos(cur.current.pol * DEG));
      // 보는 점은 부지(사진 사각형) 밖으로 나가지 않는다: 사진 좌표에서 맞춘다 (월드 축 상자는 돈 사진보다 넓다)
      clampToSite(g.x + Math.sin(a) * dx * upp - Math.cos(a) * fwd, g.z + Math.cos(a) * dx * upp + Math.sin(a) * fwd, g);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      touching.current = pointers.size > 0;
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      goal.current.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, goal.current.dist * Math.exp(e.deltaY * 0.0012)));
    };
    const menu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
    };
  }, [gl, camera]);

  // 필요할 때만 그리기: 카메라가 목표에 아직 닿지 않았으면 깨운다
  useWaker(() => viewError(goal.current, cur.current) > SETTLED);

  useFrame((_, delta) => {
    const g = goal.current;
    const c = cur.current;
    if (follow.current && focusKey && director.anchor(focusKey, anchor.current, 'focus')) {
      g.x = anchor.current.x;
      g.y = anchor.current.y;
      g.z = anchor.current.z;
    }
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * (touching.current ? DRAG_GLIDE : GLIDE));
    c.x += (g.x - c.x) * k;
    c.y += (g.y - c.y) * k;
    c.z += (g.z - c.z) * k;
    c.dist += (g.dist - c.dist) * k;
    c.pol += (g.pol - c.pol) * k;
    c.az += (angleDelta(c.az * DEG, g.az * DEG) / DEG) * k;
    c.fov += (g.fov - c.fov) * k;
    if (Math.abs(camera.fov - c.fov) > 1e-3) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }

    const a = c.az * DEG;
    const p = c.pol * DEG;
    // 세로 화면에서는 위아래가 남으므로 구역(mid)은 다 물러나지 않는다(최대 1.3배). 부지 전체(wide)는 좁은 폰에서도 부지가 다 들어오게 끝까지 물러난다
    const wideness = Math.min(1, Math.max(0, (c.dist - TIER_DISTANCE.mid) / (TIER_DISTANCE.wide - TIER_DISTANCE.mid)));
    const ratio = REFERENCE_ASPECT / Math.max(0.3, (size.width - insetRef.current.right) / Math.max(1, size.height));
    // (부지는 비스듬히 보면 기준 화면이 가정한 것보다 옆으로 넓다: 좁은 화면의 wide는 조금 더 물러나 서쪽 끝(압축기 건물)까지 담는다)
    const narrow = Math.min(1, Math.max(0, (ratio - 1) / 1.5));
    const fit = Math.min(1.3 + wideness * 2.3, Math.max(1, ratio) * (1 + 0.24 * wideness * narrow));
    const dist = c.dist * fit;
    // 패널에 가려지지 않게 보는 점을 화면에서 왼쪽·위로 민다
    const upp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / Math.max(1, size.height);
    const shiftRight = (insetRef.current.right / 2) * upp;
    // (눈높이로 수평에 가깝게 보는 화면(사진 방향)은 위아래 밀기를 하지 않는다: 바닥 위로 밀면 카메라가 앞뒤로 몇 m씩 옮겨 간다)
    const level = Math.min(1, Math.max(0, (84 - c.pol) / 14));
    const shiftDown = ((((insetRef.current.bottom - insetRef.current.top) / 2) * upp) / Math.max(0.3, Math.cos(p))) * level;
    const tx = c.x - Math.sin(a) * shiftRight + Math.cos(a) * shiftDown;
    const tz = c.z - Math.cos(a) * shiftRight - Math.sin(a) * shiftDown;
    camera.position.set(tx + Math.sin(p) * Math.cos(a) * dist, c.y + Math.cos(p) * dist, tz - Math.sin(p) * Math.sin(a) * dist);
    camera.lookAt(tx, c.y, tz);
    // 안개는 카메라 거리를 따라간다: 좁은 화면에서 부지 전체·위에서 보기로 멀리 물러나도 부지는 또렷하고 먼 언덕·능선만 흐려진다
    const fog = scene.fog as { near: number; far: number } | null;
    if (fog) {
      fog.near = Math.max(FOG_NEAR, dist + 30);
      fog.far = Math.max(FOG_FAR, dist + 240);
    }
  });

  return null;
}

/** 카메라가 바닥에서 어느 쪽에 있는지 (압축기 건물의 카메라 쪽 벽을 숨길 때 쓴다) */
export function cameraSide(camera: { position: { x: number; z: number } }, out: { x: number; z: number }): void {
  const len = Math.hypot(camera.position.x, camera.position.z) || 1;
  out.x = camera.position.x / len;
  out.z = camera.position.z / len;
}
