import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWatchdog } from './watchdog';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T05:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const make = (onTimeout = vi.fn()) => ({
  onTimeout,
  watchdog: createWatchdog({ timeoutMs: 15_000, checkIntervalMs: 1_000, onTimeout }),
});

describe('watchdog', () => {
  it('15초 동안 아무것도 못 받으면 한 번 알린다 (마지막 수신 시각과 함께)', () => {
    const { watchdog, onTimeout } = make();
    const startedAt = Date.now();
    watchdog.start();

    vi.advanceTimersByTime(14_000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith(startedAt);

    vi.advanceTimersByTime(60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('메시지를 받을 때마다 15초가 다시 시작된다', () => {
    const { watchdog, onTimeout } = make();
    watchdog.start();
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(10_000);
      watchdog.touch();
    }
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stop하면 더는 알리지 않는다', () => {
    const { watchdog, onTimeout } = make();
    watchdog.start();
    vi.advanceTimersByTime(10_000);
    watchdog.stop();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('다시 start하면 새로 15초를 센다', () => {
    const { watchdog, onTimeout } = make();
    watchdog.start();
    vi.advanceTimersByTime(15_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    watchdog.start();
    vi.advanceTimersByTime(14_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(onTimeout).toHaveBeenCalledTimes(2);
  });
});
