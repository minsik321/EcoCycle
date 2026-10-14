// 박자 맞추기 (three 미사용, 테스트 가능). 화면 주사율로 불리는 advance()가
//  - 단계의 프레임 상한 간격마다 한 번만 일하고,
//  - 끊기지 않았으면 월드 시계를 돌리고 (끊기면 돌리지 않는다: 모든 움직임이 멈춘다),
//  - 무엇이 실제로 움직였거나 깨우개가 부르면 "한 장 그려라"를 돌려준다.

export interface Steppable {
  step(dt: number): void;
  motionKey(): number;
}

export interface FrameNeeds {
  needsFrame(): boolean;
}

export class Pace {
  private last = Number.NaN;
  private beat = Number.NEGATIVE_INFINITY;
  private lastKey = Number.NaN;

  constructor(
    private readonly world: Steppable,
    private readonly needs: FrameNeeds,
    /** 초당 최대 박자. 0이면 상한 없음 */
    private readonly maxFps: number,
  ) {}

  /** now(ms)에 불린다. 그려야 하면 true, 이번 박자가 아니거나 그릴 것이 없으면 false */
  advance(now: number, frozen: boolean): boolean {
    const gap = this.maxFps > 0 ? 1000 / this.maxFps : 0;
    // 주사율 60Hz에서 30fps면 한 번 걸러 한 번 (4ms는 주사 간격의 흔들림 여유)
    if (gap > 0 && now - this.beat < gap - 4) return false;
    this.beat = gap > 0 && now - this.beat < gap * 2 ? this.beat + gap : now;
    const dt = Number.isNaN(this.last) ? 0 : (now - this.last) / 1000;
    this.last = now;
    if (!frozen) this.world.step(dt);
    const key = this.world.motionKey();
    const moved = key !== this.lastKey;
    this.lastKey = key;
    return this.needs.needsFrame() || moved;
  }
}
