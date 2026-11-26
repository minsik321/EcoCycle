import { TIER_DISTANCE, sitePx } from '../world/layout';

// 스튜디오 카메라의 거리 맞춤 (Rig가 매 프레임 부른다. 순수 계산이라 단위 테스트로 고정한다).
// 프리셋 거리는 기준 화면(1440×900, 패널 320)에 맞춘 값이고, 화면비·패널·부지 외곽에 맞춰 물러날 거리와 보는 점을 정한다.

const DEG = Math.PI / 180;

/** 프리셋 거리는 이 가로세로 비(패널을 뺀 빈 영역)에 맞춘 값이다. 더 좁은 화면에서는 그만큼 물러난다 */
export const REFERENCE_ASPECT = (1440 - 320) / 900;

export interface FrameInset {
  right: number;
  bottom: number;
  top: number;
}

/** 맞출 카메라 상태: 보는 곳(x, y, z), 프리셋 거리, 방위·천정각(도) */
export interface FrameState {
  x: number;
  y: number;
  z: number;
  dist: number;
  az: number;
  pol: number;
}

/**
 * 부지 전체(wide) 화면에 다 들어와야 하는 외곽 꼭짓점 (사진 px, 바닥 높이 0): 마당 포장 판(PLATEAU)의 서쪽·남쪽 끝과 남동 울타리,
 * 동쪽 옹벽·도로 가장자리, 북쪽 숲 가장자리. 사진 밖으로 나간 포장 판 서쪽 끝(x −60)까지 담는다
 */
const OUTLINE: readonly (readonly [number, number])[] = ([
  [-60, 318],
  [-60, 680],
  [200, 680],
  [240, 600],
  [300, 548],
  [420, 446],
  [470, 384],
  [503, 334],
  [514, 276],
  [513, 200],
  [498, 40],
  [252, 0],
  [0, 0],
] as const).map(([x, y]) => sitePx(x, y));
/** 외곽 꼭짓점이 패널 가장자리에서 떨어져야 하는 여백(px) */
const OUTLINE_MARGIN = 10;

/** 보는 점(tx, ty, tz)·거리·방위·천정각에서 외곽 꼭짓점이 모두 패널 밖 빈 화면 안에 투영되는가 */
export function outlineFits(
  tx: number,
  ty: number,
  tz: number,
  dist: number,
  a: number,
  p: number,
  tanHalf: number,
  width: number,
  height: number,
  ins: { right: number; bottom: number; top: number },
): boolean {
  // 카메라 → 보는 점 방향(f)과 화면 축(오른쪽 r, 위 u). lookAt(위 = +y)과 같다
  const dx = Math.sin(p) * Math.cos(a);
  const dy = Math.cos(p);
  const dz = -Math.sin(p) * Math.sin(a);
  const fx = -dx;
  const fy = -dy;
  const fz = -dz;
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const aspect = width / Math.max(1, height);
  const cx = tx + dx * dist;
  const cy = ty + dy * dist;
  const cz = tz + dz * dist;
  const left = -1 + (2 * OUTLINE_MARGIN) / width;
  const right = 1 - (2 * (ins.right + OUTLINE_MARGIN)) / width;
  const bottom = -1 + (2 * (ins.bottom + OUTLINE_MARGIN)) / height;
  const top = 1 - (2 * (ins.top + OUTLINE_MARGIN)) / height;
  for (const [x, z] of OUTLINE) {
    const vx = x - cx;
    const vy = -cy;
    const vz = z - cz;
    const depth = vx * fx + vy * fy + vz * fz;
    if (depth <= 0.1) return false;
    const sx = (vx * rx + vz * rz) / (depth * tanHalf * aspect);
    const sy = (vx * ux + vy * uy + vz * uz) / (depth * tanHalf);
    if (sx < left || sx > right || sy < bottom || sy > top) return false;
  }
  return true;
}

/**
 * 실제 카메라 거리를 돌려주고 보는 점(패널에 가려지지 않게 화면에서 왼쪽·위로 민 점)을 out에 적는다.
 * - 구역(mid ≤ 44)·사진 방향·close: 화면비 맞춤만 (wideness 0)
 * - 베일 적치(mid 52): 53cac92 식 그대로 (좁은 화면의 넓은 거리는 1 + 0.24 × wideness × narrow만큼 더 물러난다)
 * - 위에서 보기(천정각 작음): 53cac92 식으로 시작하고, 그 거리에서 부지 외곽이 패널에 가려질 때만 다 들어오는 거리까지 물러난다.
 *   폰·태블릿(세로 빈 화면)은 53cac92 식 거리에서 이미 다 들어와 그대로이고, 오른쪽 상세 패널과 위·아래 패널이 함께 있는
 *   데스크톱(가로 빈 화면이 낮다)만 물러난다 (S2g)
 * - 비스듬한 부지 전체(wide): 그 덧셈 없이 시작해 부지 외곽 꼭짓점이 빈 화면에 다 들어오는 거리까지 물러난다
 */
export function frameView(c: FrameState, fovDeg: number, width: number, height: number, ins: FrameInset, out: { x: number; z: number }): number {
  const a = c.az * DEG;
  const p = c.pol * DEG;
  // 세로 화면에서는 위아래가 남으므로 구역(mid)은 다 물러나지 않는다(최대 1.3배)
  const wideness = Math.min(1, Math.max(0, (c.dist - TIER_DISTANCE.mid) / (TIER_DISTANCE.wide - TIER_DISTANCE.mid)));
  // 외곽 맞춤의 몫: wide 단계 쪽 절반(mid·wide 중간 → wide)에서만 0 → 1. 베일 적치(52)·구역은 0
  const half = (TIER_DISTANCE.wide + TIER_DISTANCE.mid) / 2;
  const outlineShare = Math.min(1, Math.max(0, (c.dist - half) / (TIER_DISTANCE.wide - half)));
  // 53cac92 덧셈(boost)을 빼는 몫은 비스듬히 볼 때만: 위에서 보기(천정각 1)는 덧셈을 그대로 두고 외곽 맞춤은 모자랄 때만 더한다
  const oblique = Math.min(1, Math.max(0, (c.pol - 10) / 10));
  const outlineWeight = outlineShare * oblique;
  const ratio = REFERENCE_ASPECT / Math.max(0.3, (width - ins.right) / Math.max(1, height));
  // (부지는 비스듬히 보면 기준 화면이 가정한 것보다 옆으로 넓다: 외곽 맞춤을 쓰지 않는 넓은 화면은 좁은 화면에서 조금 더 물러난다)
  const narrow = Math.min(1, Math.max(0, (ratio - 1) / 1.5));
  const boost = 1 + 0.24 * wideness * narrow * (1 - outlineWeight);
  const fit = Math.min(1.3 + wideness * 2.3, Math.max(1, ratio) * boost);
  const tanHalf = Math.tan((fovDeg * DEG) / 2);
  // (눈높이로 수평에 가깝게 보는 화면(사진 방향)은 위아래 밀기를 하지 않는다: 바닥 위로 밀면 카메라가 앞뒤로 몇 m씩 옮겨 간다)
  const level = Math.min(1, Math.max(0, (84 - c.pol) / 14));
  const aim = (dist: number): void => {
    const upp = (2 * dist * tanHalf) / Math.max(1, height);
    const shiftRight = (ins.right / 2) * upp;
    const shiftDown = ((((ins.bottom - ins.top) / 2) * upp) / Math.max(0.3, Math.cos(p))) * level;
    out.x = c.x - Math.sin(a) * shiftRight + Math.cos(a) * shiftDown;
    out.z = c.z - Math.cos(a) * shiftRight - Math.sin(a) * shiftDown;
  };
  let dist = c.dist * fit;
  // 부지 전체(wide, 비스듬히 또는 위에서)는 부지 외곽(포장 판의 서쪽·남쪽 끝, 옹벽, 숲 가장자리)이 패널 밖 빈 화면에 다 들어오는 거리까지 물러난다.
  // 화면비·패널을 어림하지 않고 외곽 꼭짓점을 직접 투영해 잰다. 이미 다 들어오면 거리를 바꾸지 않는다(물러나기만 한다)
  if (outlineShare > 0) {
    const fits = (d: number): boolean => {
      aim(d);
      return outlineFits(out.x, c.y, out.z, d, a, p, tanHalf, width, height, ins);
    };
    if (!fits(dist)) {
      let lo = dist;
      let hi = dist * 2.5;
      if (fits(hi)) {
        for (let i = 0; i < 14; i += 1) {
          const m = (lo + hi) / 2;
          if (fits(m)) hi = m;
          else lo = m;
        }
      }
      dist += (hi - dist) * outlineShare;
    }
  }
  aim(dist);
  return dist;
}
