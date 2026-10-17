/**
 * 주·월 그래프의 x축 눈금: 현지 시각 자정마다 하나씩, 너무 많으면 건너뛰며 최대 maxTicks개로 줄인다.
 * (1시간·6시간 간격 점마다 눈금을 찍으면 같은 날짜가 여러 번 반복된다)
 */
export function dateTicks(fromMs: number, toMs: number, maxTicks = 8): number[] {
  if (!(toMs > fromMs)) return [];
  const first = new Date(fromMs);
  first.setHours(0, 0, 0, 0);
  if (first.getTime() < fromMs) first.setDate(first.getDate() + 1);

  const days: number[] = [];
  for (const d = new Date(first); d.getTime() <= toMs; d.setDate(d.getDate() + 1)) days.push(d.getTime());

  const step = Math.max(1, Math.ceil(days.length / maxTicks));
  return days.filter((_, i) => i % step === 0);
}

/** "10/13" 형식 (현지 날짜) */
export function formatDateTick(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
