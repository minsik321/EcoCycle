import { useFrame } from '@react-three/fiber';
import { createContext, useContext, useEffect, useRef } from 'react';

// 필요할 때만 그리기 (frameloop="demand"). 장면의 각 부분이 "나 아직 움직이는 중"을 알리는 깨우개를 등록하고,
// Stage의 Pacer가 정해진 박자마다 깨우개를 물어 하나라도 참이면 한 장 그린다.

export type Waker = () => boolean;

export class Motion {
  private readonly wakers = new Set<Waker>();
  /** 몇 장 더 그려야 하는지 (선택·크기 바뀜처럼 한 번 일어나는 일) */
  private pending = 0;

  add(waker: Waker): () => void {
    this.wakers.add(waker);
    return () => this.wakers.delete(waker);
  }

  /** 다음 몇 장을 그리게 한다 (부드럽게 따라가는 값이 자리 잡도록 여러 장) */
  kick(frames = 3): void {
    this.pending = Math.max(this.pending, frames);
  }

  needsFrame(): boolean {
    if (this.pending > 0) {
      this.pending -= 1;
      return true;
    }
    for (const waker of this.wakers) if (waker()) return true;
    return false;
  }
}

export const MotionContext = createContext<Motion | null>(null);

/** 깨우개 등록. fn은 매번 최신 값을 읽도록 ref로 붙든다 */
export function useWaker(fn: Waker): void {
  const motion = useContext(MotionContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => motion?.add(() => ref.current()), [motion]);
}

/**
 * 월드 시계만 따르는 장식(퍼지는 고리, 흐르는 점선, 경고등 깜빡임)용 깨우개.
 * active()가 참이고 마지막으로 그린 뒤 시계가 흘렀으면 깨운다 (끊기면 시계가 멈추므로 깨우지 않는다).
 */
export function useClockWaker(clock: { t: number }, active: () => boolean): void {
  const drawn = useRef(Number.NaN);
  useFrame(() => {
    drawn.current = clock.t;
  });
  useWaker(() => active() && clock.t !== drawn.current);
}
