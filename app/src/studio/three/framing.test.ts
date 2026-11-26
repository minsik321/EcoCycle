import { describe, expect, it } from 'vitest';
import { REFERENCE_ASPECT, frameView, outlineFits } from './framing';
import { AREAS, TIER_DISTANCE, TOP_VIEW, WIDE_VIEW, siteHeading, sitePx } from '../world/layout';
import type { ViewPreset } from '../world/layout';

// 카메라 거리 맞춤 회귀: 베일 적치는 53cac92 식 그대로, 비스듬한 부지 전체는 외곽 투영 맞춤(ccf4b10),
// 위에서 보기는 53cac92 식에서 외곽이 잘릴 때만 외곽 맞춤(S2g: 데스크톱)
const SOUTH_AZ = (siteHeading(0, 1) * 180) / Math.PI;
const state = (p: ViewPreset) => {
  const [x, z] = sitePx(p.at[0], p.at[1]);
  return { x, y: p.height, z, dist: p.distance, az: SOUTH_AZ + p.azimuth, pol: p.polar };
};
const NO_INSET = { right: 0, bottom: 0, top: 0 };
const SIZES = [
  [390, 844],
  [820, 1180],
  [1440, 900],
] as const;

/** StudioView의 INSET (wide·narrow·phone 배치) */
const PANEL_INSET: Record<string, { right: number; bottom: number; top: number }> = {
  '390x844': { right: 0, bottom: 120, top: 110 },
  '820x1180': { right: 0, bottom: 300, top: 170 },
  '1440x900': { right: 320, bottom: 140, top: 150 },
};

/** 프리셋을 거리 d에서 볼 때(보는 점은 frameView가 그 거리에서 미는 곳) 외곽이 다 들어오는가 */
function fitsAt(p: ViewPreset, d: number, w: number, h: number, ins: { right: number; bottom: number; top: number }): boolean {
  const s = state(p);
  // 보는 점은 frameView의 aim과 같이 패널만큼 민다 (미는 양은 거리에 비례한다)
  const upp = (2 * d * Math.tan((10 * Math.PI) / 180)) / h;
  const a = (s.az * Math.PI) / 180;
  const pp = (s.pol * Math.PI) / 180;
  const shiftRight = (ins.right / 2) * upp;
  const level = Math.min(1, Math.max(0, (84 - s.pol) / 14));
  const shiftDown = (((ins.bottom - ins.top) / 2) * upp) / Math.max(0.3, Math.cos(pp)) * level;
  const x = s.x - Math.sin(a) * shiftRight + Math.cos(a) * shiftDown;
  const z = s.z - Math.cos(a) * shiftRight - Math.sin(a) * shiftDown;
  return outlineFits(x, s.y, z, d, a, pp, Math.tan((10 * Math.PI) / 180), w, h, ins);
}

/** 53cac92의 Rig.tsx 거리 식 (외곽 맞춤 이전) */
function legacyDistance(dist: number, width: number, height: number, right: number): number {
  const wideness = Math.min(1, Math.max(0, (dist - TIER_DISTANCE.mid) / (TIER_DISTANCE.wide - TIER_DISTANCE.mid)));
  const ratio = REFERENCE_ASPECT / Math.max(0.3, (width - right) / Math.max(1, height));
  const narrow = Math.min(1, Math.max(0, (ratio - 1) / 1.5));
  return dist * Math.min(1.3 + wideness * 2.3, Math.max(1, ratio) * (1 + 0.24 * wideness * narrow));
}

describe('frameView', () => {
  it('위에서 보기는 53cac92 거리에서 외곽이 다 들어오면 그 거리 그대로다 (폰·태블릿)', () => {
    for (const [w, h] of SIZES) {
      for (const ins of [NO_INSET, { right: 320, bottom: 0, top: 64 }, PANEL_INSET[`${w}x${h}`]!]) {
        const legacy = legacyDistance(TOP_VIEW.distance, w, h, ins.right);
        const out = { x: 0, z: 0 };
        const d = frameView(state(TOP_VIEW), 20, w, h, ins, out);
        if (fitsAt(TOP_VIEW, legacy, w, h, ins)) expect(d).toBeCloseTo(legacy, 6);
        else expect(d).toBeGreaterThan(legacy);
      }
    }
    // 리뷰 4회차의 값: 390×844 567.71, 820×1180 342.95 (StudioView의 실제 패널 inset으로도 같다)
    expect(frameView(state(TOP_VIEW), 20, 390, 844, NO_INSET, { x: 0, z: 0 })).toBeCloseTo(567.71, 1);
    expect(frameView(state(TOP_VIEW), 20, 820, 1180, NO_INSET, { x: 0, z: 0 })).toBeCloseTo(342.95, 1);
    expect(frameView(state(TOP_VIEW), 20, 390, 844, PANEL_INSET['390x844']!, { x: 0, z: 0 })).toBeCloseTo(567.71, 1);
    expect(frameView(state(TOP_VIEW), 20, 820, 1180, PANEL_INSET['820x1180']!, { x: 0, z: 0 })).toBeCloseTo(342.95, 1);
  });

  it('데스크톱 위에서 보기는 패널(위 상단 바·지표, 아래 공정, 오른쪽 상세)을 피해 부지 외곽을 다 담는다 (S2g)', () => {
    const ins = PANEL_INSET['1440x900']!;
    const legacy = legacyDistance(TOP_VIEW.distance, 1440, 900, ins.right);
    // 53cac92 거리(170)에서는 북쪽·남쪽 끝이 패널 밑으로 들어간다
    expect(fitsAt(TOP_VIEW, legacy, 1440, 900, ins)).toBe(false);
    const s = state(TOP_VIEW);
    const out = { x: 0, z: 0 };
    const d = frameView(s, 20, 1440, 900, ins, out);
    expect(outlineFits(out.x, s.y, out.z, d, (s.az * Math.PI) / 180, (s.pol * Math.PI) / 180, Math.tan((10 * Math.PI) / 180), 1440, 900, ins)).toBe(true);
    // 겨우 다 들어오는 거리: 조금만 가까우면 다시 잘린다
    expect(fitsAt(TOP_VIEW, d * 0.97, 1440, 900, ins)).toBe(false);
    expect(d).toBeGreaterThan(legacy);
  });

  it('부지 전체(비스듬히)는 실제 패널 inset에서도 외곽을 다 담는다', () => {
    // (wide는 천정각 46도라 S2g 전 외곽 맞춤 몫(outlineShare × oblique)과 지금 몫(outlineShare)이 같다)
    for (const [w, h] of SIZES) {
      const ins = PANEL_INSET[`${w}x${h}`]!;
      const s = state(WIDE_VIEW);
      const out = { x: 0, z: 0 };
      const d = frameView(s, 20, w, h, ins, out);
      expect(outlineFits(out.x, s.y, out.z, d, (s.az * Math.PI) / 180, (s.pol * Math.PI) / 180, Math.tan((10 * Math.PI) / 180), w, h, ins)).toBe(true);
    }
  });

  it('구역(mid)은 베일 적치(52)까지 53cac92와 같은 거리다', () => {
    for (const [w, h] of SIZES) {
      for (const p of AREAS) {
        expect(frameView(state(p), 20, w, h, NO_INSET, { x: 0, z: 0 })).toBeCloseTo(legacyDistance(p.distance, w, h, 0), 6);
      }
    }
  });

  it('부지 전체는 외곽 꼭짓점이 겨우 다 들어오는 거리까지 물러난다', () => {
    for (const [w, h] of SIZES) {
      const s = state(WIDE_VIEW);
      const out = { x: 0, z: 0 };
      const d = frameView(s, 20, w, h, NO_INSET, out);
      const tanHalf = Math.tan((10 * Math.PI) / 180);
      const a = (s.az * Math.PI) / 180;
      const p = (s.pol * Math.PI) / 180;
      expect(outlineFits(out.x, s.y, out.z, d, a, p, tanHalf, w, h, NO_INSET)).toBe(true);
      // 좁은 화면에서는 화면비만으로는 서쪽 경계가 잘려 외곽 맞춤이 거리를 정한다
      if (w < 1000) {
        const base = WIDE_VIEW.distance * Math.min(1.3 + 2.3, Math.max(1, REFERENCE_ASPECT / (w / h)));
        expect(d).toBeGreaterThan(base);
        expect(d).not.toBeCloseTo(legacyDistance(WIDE_VIEW.distance, w, h, 0), 1);
      }
    }
  });
});
