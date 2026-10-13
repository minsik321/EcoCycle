import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { sceneStats } from './stats';

// 그리기 루프 제어. Canvas는 frameloop="demand"(요청할 때만 그림)로 두고, 여기서 필요할 때만 그리기를 요청한다.
//  - 움직임이 없으면 그리지 않는다.
//  - 움직임이 있어도 초당 maxFps번까지만 요청한다 (센서 값이 빨라도 화면은 묶어서 반영).
//  - paused(화면이 숨겨짐, CCTV가 열림)이면 아예 요청하지 않는다.

const SETTLE_MS = 600;

export interface FrameDriverProps {
  maxFps: number;
  /** 계속 움직이는 것이 있는가 (로봇팔 작동 중, 컨베이어·압축기 가동 중) */
  animating: boolean;
  /** 그리기를 완전히 멈춘다 */
  paused: boolean;
  /** 카메라가 이동 중인지 (CameraRig가 쓴다). 이동이 끝날 때까지는 계속 그린다 */
  busyRef: MutableRefObject<boolean>;
}

export function FrameDriver({ maxFps, animating, paused, busyRef }: FrameDriverProps) {
  const invalidate = useThree((state) => state.invalidate);

  // 움직임이 멈춘 직후에도 잠깐은 더 그린다: 관절 값은 0.15초 늦춰 보간하므로 마지막 자세까지 그려야 한다
  const settleUntil = useRef(0);

  useEffect(() => {
    if (!animating) settleUntil.current = performance.now() + SETTLE_MS;
  }, [animating]);

  useEffect(() => {
    if (paused) return;
    invalidate(); // 다시 보이게 됐을 때 한 번은 그린다
    const timer = setInterval(() => {
      if (animating || busyRef.current || performance.now() < settleUntil.current) invalidate();
    }, 1000 / maxFps);
    return () => clearInterval(timer);
  }, [maxFps, animating, paused, busyRef, invalidate]);

  useFrame(() => {
    sceneStats.frames += 1;
    sceneStats.lastFrameMs = performance.now();
  });
  return null;
}
