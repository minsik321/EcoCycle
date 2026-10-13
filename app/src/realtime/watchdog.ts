// 무수신 감시. 마지막 메시지 뒤 timeoutMs(기본 15초) 동안 아무것도 없으면 한 번 알린다.
// 서버는 heartbeat를 5초마다 보내므로 15초 무수신은 연결이 죽었다는 뜻이다.

export interface Watchdog {
  /** 감시를 시작한다. 지금을 마지막 수신 시각으로 본다. */
  start(): void;
  /** 메시지를 받았다 */
  touch(): void;
  stop(): void;
  /** 마지막 수신 시각(ms). 시작한 적이 없으면 null */
  lastSeenMs(): number | null;
}

export interface WatchdogOptions {
  timeoutMs: number;
  checkIntervalMs: number;
  /** 무수신 시간이 timeoutMs에 닿으면 감시를 멈추고 한 번 부른다. 인자는 마지막 수신 시각(ms) */
  onTimeout: (lastSeenMs: number) => void;
  now?: () => number;
}

export function createWatchdog(options: WatchdogOptions): Watchdog {
  const now = options.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSeen: number | null = null;

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  return {
    start() {
      stop();
      lastSeen = now();
      timer = setInterval(() => {
        if (lastSeen !== null && now() - lastSeen >= options.timeoutMs) {
          const seen = lastSeen;
          stop();
          options.onTimeout(seen);
        }
      }, options.checkIntervalMs);
    },
    touch() {
      lastSeen = now();
    },
    stop,
    lastSeenMs: () => lastSeen,
  };
}
