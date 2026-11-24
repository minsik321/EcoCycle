// 길 차례: 한 번에 한 대(트럭이나 지게차)만 그 길을 쓴다. three 미사용.
// 잡은 쪽만 놓을 수 있고, 같은 쪽이 다시 잡으면 그대로 잡은 것으로 본다.

export class Token {
  /** 지금 차례를 잡은 쪽 (트럭 아이디나 "forklift:N"), 없으면 null */
  holder: string | null = null;
  /** 이번 걸음에 차례를 기다린 트럭이 있다 (지게차는 트럭이 기다리면 잡지 않는다: 트럭이 먼저) */
  wanted = false;

  /** id가 지금 잡을 수 있는가 (비었거나 이미 id가 잡았다) */
  free(id: string): boolean {
    return this.holder === null || this.holder === id;
  }

  /** 비었으면 잡는다. 잡았으면 true. 못 잡았으면 기다린다고 적는다 */
  take(id: string): boolean {
    if (!this.free(id)) {
      this.wanted = true;
      return false;
    }
    this.holder = id;
    return true;
  }

  /** 기다리는 트럭이 없을 때만 잡는다 (지게차용) */
  takeIfQuiet(id: string): boolean {
    if (this.holder === id) return true;
    if (this.wanted || this.holder !== null) return false;
    this.holder = id;
    return true;
  }

  release(id: string): void {
    if (this.holder === id) this.holder = null;
  }
}
