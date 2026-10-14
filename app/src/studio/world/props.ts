import { C } from '../theme';
import type { Kit } from '../three/kit';
import { BALE } from './layout';

// 여러 곳에 놓는 소품 조립법. 위치만 받아 Kit에 조각을 더한다.

export function tree(k: Kit, x: number, z: number, s = 1, variant = 0): void {
  const tones = [C.green, C.greenDeep, '#b7dcae'];
  const a = tones[variant % 3]!;
  const b = tones[(variant + 1) % 3]!;
  k.at([x, 0, z], variant * 1.3, () => {
    k.cyl(C.trunk, [0.07, 0.1], 0.75, [0, 0, 0], { seg: 10 });
    k.ball(a, 0.62, [0, 1.15, 0], { scale: [1, 0.92, 1], seg: 20 });
    k.ball(b, 0.44, [0.34, 1.52, 0.12], { seg: 18 });
    k.ball(a, 0.36, [-0.3, 1.58, -0.18], { seg: 16 });
    if (variant % 2 === 0) k.ball(b, 0.3, [0.02, 1.86, 0.05], { seg: 14 });
  }, s);
}

export function bush(k: Kit, x: number, z: number, variant = 0): void {
  const tone = variant % 2 === 0 ? C.green : C.greenDeep;
  k.ball(tone, 0.34, [x, 0.22, z], { scale: [1.2, 0.8, 1], seg: 14 });
  k.ball(variant % 2 === 0 ? C.greenDeep : '#b7dcae', 0.24, [x + 0.3, 0.18, z + 0.12], { seg: 12 });
}

export function lamp(k: Kit, x: number, z: number, rotY = 0): void {
  k.at([x, 0, z], rotY, () => {
    k.cyl(C.concreteDark, 0.13, 0.12, [0, 0, 0], { seg: 12 });
    k.cyl(C.steelLight, [0.04, 0.055], 2.7, [0, 0.1, 0], { seg: 10, mat: 'metal' });
    k.box(C.steelLight, [0.06, 0.06, 0.75], [0, 2.76, 0.32], { r: 0.02, mat: 'metal' });
    k.box(C.wall, [0.2, 0.08, 0.42], [0, 2.7, 0.6], { r: 0.035 });
    k.box('#fff1c2', [0.14, 0.02, 0.32], [0, 2.685, 0.6], { r: 0, mat: 'glow', glow: 2.6 });
  });
}

export function pallet(k: Kit, x: number, z: number, rotY = 0, y = 0.02): void {
  k.at([x, y, z], rotY, () => {
    for (const dz of [-0.36, 0, 0.36]) k.box(C.kraftDark, [0.9, 0.07, 0.09], [0, 0, dz], { r: 0.015 });
    for (let i = 0; i < 5; i += 1) k.box(C.kraftLight, [0.13, 0.035, 0.84], [-0.38 + i * 0.19, 0.07, 0], { r: 0.012 });
  });
}

export function drum(k: Kit, x: number, z: number, hex: string): void {
  k.cyl(hex, 0.21, 0.6, [x, 0.06, z], { seg: 18, mat: 'gloss' });
  k.cyl(C.steelLight, 0.218, 0.03, [x, 0.24, z], { seg: 18, mat: 'metal' });
  k.cyl(C.steelLight, 0.218, 0.03, [x, 0.46, z], { seg: 18, mat: 'metal' });
  k.cyl(C.dark, 0.17, 0.012, [x, 0.66, z], { seg: 18 });
}

export function cone(k: Kit, x: number, z: number, s = 1): void {
  k.box(C.yellowDeep, [0.24 * s, 0.03, 0.24 * s], [x, 0.03, z], { r: 0.012 });
  k.cyl(C.yellow, [0.025 * s, 0.09 * s], 0.32 * s, [x, 0.06, z], { seg: 12 });
  k.cyl(C.white, [0.047 * s, 0.062 * s], 0.07 * s, [x, 0.06 + 0.14 * s, z], { seg: 12 });
}

/** 결속된 베일 한 덩이. (x, y, z)는 바닥 중심, 긴 쪽이 로컬 X */
export function bale(k: Kit, x: number, y: number, z: number, rotY = 0): void {
  const { w, h, d } = BALE;
  k.at([x, y, z], rotY, () => {
    k.box(C.kraft, [d, h, w], [0, 0, 0], { r: 0.06, seg: 3 });
    // 눌린 종이 층
    for (let i = 1; i < 5; i += 1) k.box(i % 2 ? C.kraftDark : C.kraftLight, [d + 0.012, 0.022, w + 0.012], [0, (h * i) / 5 - 0.01, 0], { r: 0.01 });
    k.box(C.paper, [0.16, 0.05, w + 0.016], [0.18, h * 0.52, 0], { r: 0.012 });
    k.box(C.paperGrey, [0.2, 0.045, w + 0.016], [-0.24, h * 0.3, 0], { r: 0.012 });
    // 결속 끈
    for (const dx of [-0.3, 0, 0.3]) k.box(C.dark, [0.028, h + 0.02, w + 0.02], [dx, -0.01, 0], { r: 0.008 });
  });
}

/** 주차된 승용차 (고정 소품). +X를 본다 */
export function car(k: Kit, x: number, z: number, rotY: number, paint: string): void {
  k.at([x, 0.02, z], rotY, () => {
    k.box(paint, [1.55, 0.34, 0.74], [0, 0.13, 0], { r: 0.13, mat: 'gloss', seg: 4 });
    k.box(paint, [0.86, 0.3, 0.66], [-0.1, 0.42, 0], { r: 0.12, mat: 'gloss', seg: 4 });
    k.box(C.dark, [0.8, 0.2, 0.675], [-0.1, 0.46, 0], { r: 0.06 });
    k.box(C.dark, [0.875, 0.2, 0.56], [-0.1, 0.46, 0], { r: 0.06 });
    for (const dx of [-0.48, 0.48]) for (const dz of [-0.36, 0.36]) {
      k.cyl(C.rubber, 0.16, 0.12, [dx, 0.16, dz], { axis: 'z', seg: 16 });
      k.cyl(C.steelLight, 0.08, 0.125, [dx, 0.16, dz], { axis: 'z', seg: 12, mat: 'metal' });
    }
    for (const dz of [-0.25, 0.25]) {
      k.box('#fff6d6', [0.03, 0.07, 0.16], [0.775, 0.3, dz], { r: 0.012, mat: 'glow', glow: 1.3 });
      k.box(C.red, [0.03, 0.06, 0.16], [-0.775, 0.32, dz], { r: 0.012, mat: 'glow', glow: 1.2 });
    }
  });
}
