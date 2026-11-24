// 길 차례: 한 번에 한 대(트럭이나 지게차)만 그 길을 쓴다. three 미사용.
// 잡은 쪽만 놓을 수 있고, 같은 쪽이 다시 잡으면 그대로 잡은 것으로 본다.

export class Token {
  /** 지금 차례를 잡은 쪽 (트럭 아이디나 "forklift:N"), 없으면 null */
  holder: string | null = null;
  /** 이번 걸음에 차례를 기다린 트럭이 있다 (지게차는 트럭이 기다리면 잡지 않는다: 트럭이 먼저) */
  wanted = false;
  /** 오래 기다린 지게차가 다음 차례를 맡아 둔 것 (트럭이 끊이지 않아 지게차가 굶지 않게) */
  reservedBy: string | null = null;

  /** id가 지금 잡을 수 있는가 (비었거나 이미 id가 잡았다) */
  free(id: string): boolean {
    return this.holder === null || this.holder === id;
  }

  /** id가 지금 잡을 수 있는가 (다른 지게차가 맡아 둔 차례면 못 잡는다) */
  available(id: string): boolean {
    return this.free(id) && !(this.holder === null && this.reservedBy !== null && this.reservedBy !== id);
  }

  /** 비었으면 잡는다. 잡았으면 true. 못 잡았으면 기다린다고 적는다 */
  take(id: string): boolean {
    if (!this.available(id)) {
      this.wanted = true;
      return false;
    }
    this.holder = id;
    return true;
  }

  /** 기다리는 트럭이 없을 때만 잡는다 (지게차용) */
  takeIfQuiet(id: string): boolean {
    if (this.holder === id) return true;
    if (this.holder !== null) return false;
    const mine = this.reservedBy === id;
    if (!mine && (this.wanted || this.reservedBy !== null)) return false;
    this.holder = id;
    if (mine) this.reservedBy = null;
    return true;
  }

  /** 다음 차례를 맡아 둔다 (이미 다른 쪽이 맡았으면 그대로) */
  reserve(id: string): void {
    this.reservedBy ??= id;
  }

  release(id: string): void {
    if (this.holder === id) this.holder = null;
  }
}
