import { describe, expect, it } from 'vitest';
import { REFERENCE_ASPECT, frameView, outlineFits } from './framing';
import { AREAS, TIER_DISTANCE, TOP_VIEW, WIDE_VIEW, siteHeading, sitePx } from '../world/layout';
import type { ViewPreset } from '../world/layout';

// 카메라 거리 맞춤 회귀: 위에서 보기·베일 적치는 53cac92 식 그대로, 비스듬한 부지 전체만 외곽 투영 맞춤(ccf4b10)
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

/** 53cac92의 Rig.tsx 거리 식 (외곽 맞춤 이전) */
function legacyDistance(dist: number, width: number, height: number, right: number): number {
  const wideness = Math.min(1, Math.max(0, (dist - TIER_DISTANCE.mid) / (TIER_DISTANCE.wide - TIER_DISTANCE.mid)));
  const ratio = REFERENCE_ASPECT / Math.max(0.3, (width - right) / Math.max(1, height));
  const narrow = Math.min(1, Math.max(0, (ratio - 1) / 1.5));
  return dist * Math.min(1.3 + wideness * 2.3, Math.max(1, ratio) * (1 + 0.24 * wideness * narrow));
}

describe('frameView', () => {
  it('위에서 보기는 세 크기에서 53cac92와 같은 거리다', () => {
    for (const [w, h] of SIZES) {
      for (const ins of [NO_INSET, { right: 320, bottom: 0, top: 64 }]) {
        const out = { x: 0, z: 0 };
        expect(frameView(state(TOP_VIEW), 20, w, h, ins, out)).toBeCloseTo(legacyDistance(TOP_VIEW.distance, w, h, ins.right), 6);
      }
    }
    // 리뷰 4회차의 값: 390×844 567.71, 820×1180 342.95
    expect(frameView(state(TOP_VIEW), 20, 390, 844, NO_INSET, { x: 0, z: 0 })).toBeCloseTo(567.71, 1);
    expect(frameView(state(TOP_VIEW), 20, 820, 1180, NO_INSET, { x: 0, z: 0 })).toBeCloseTo(342.95, 1);
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
