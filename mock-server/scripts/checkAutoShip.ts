import assert from 'node:assert/strict';

// 브라우저/스트림 연결 없이 서버 시간만 진행해 자동 출하를 확인한다.
const realNow = Date.now;
const start = realNow();
let now = start;
Date.now = () => now;
try {
  const { tickProcess, processState, nextPickSector, mixingBatchId, notePlaced } = await import('../src/sim/process');
  const { BATCH_TIMING_SEC } = await import('../src/fixtures/process');
  const seen = new Set<string>();
  const shipped = new Set<string>();
  let maxPending = 0;
  for (let second = 0; second <= 1800; second++) {
    now = start + second * 1000;
    if (second % 6 === 0) {
      const sector = nextPickSector();
      if (sector) notePlaced(sector, mixingBatchId(), 0.1);
    }
    tickProcess();
    const bales = processState().bales.filter((b) => Date.parse(b.stageTimes.created!) >= start);
    for (const b of bales) {
      seen.add(b.id);
      if (b.stage === 'shipped') shipped.add(b.id);
      else assert.ok(now - Date.parse(b.stageTimes.created!) < BATCH_TIMING_SEC.ship * 1000, `${b.id}: 자동 출하 지연`);
    }
    maxPending = Math.max(maxPending, bales.filter((b) => b.stage === 'created').length);
  }
  assert.ok(seen.size > 20);
  assert.ok(shipped.size > 20);
  // 브라우저를 오래 비운 것처럼 다음 서버 틱까지 10분을 건너뛴다.
  const pending = processState().bales.filter((b) => b.stage === 'created').map((b) => b.id);
  now += 600_000;
  tickProcess();
  for (const id of pending) assert.equal(processState().bales.find((b) => b.id === id)?.stage, 'shipped');
  console.log(JSON.stringify({ simulatedMinutes: 30, produced: seen.size, shipped: shipped.size, maxPending, autoShipSeconds: BATCH_TIMING_SEC.ship, overdueAfterTimeJump: 0 }));
} finally {
  Date.now = realNow;
}
