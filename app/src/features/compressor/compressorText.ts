import type { Batch, CompressorState } from '@ecocycle/shared';
import { formatPressureMpa } from '../../config/display';
import { mixPercentText, shortId } from '../../config/processDisplay';

// 압축기 화면의 문장과 "지금 배치" 고르기. 서버가 준 값(압축기 상태·사이클 단계, 배치 stage·목표 압력)을 옮겨 적기만 한다.

/**
 * 압축기가 지금 맡은 배치: 압축 중인 배치, 없으면 배합 중(압축기로 들어올) 배치, 없으면 계획된 배치.
 * 배치·베일 화면의 "현재 배치"와 같은 순서다(서버 \`GET /batches/control\`도 압축 중을 먼저 둔다).
 */
export function compressorBatches(batches: readonly Batch[]): { current: Batch | null; next: Batch | null } {
  const order = [
    ...batches.filter((b) => b.stage === 'compressing'),
    ...batches.filter((b) => b.stage === 'mixing'),
    ...batches.filter((b) => b.stage === 'planned'),
  ];
  return { current: order[0] ?? null, next: order[1] ?? null };
}

/** 맨 위 "지금 하는 일" 한 줄 */
export function compressorActivity(c: CompressorState, batch: Batch | null): string {
  if (!c.running) return '정지 상태입니다';
  const name = batch ? `배치 ${shortId(batch.id)} ` : '';
  switch (c.cycleStage) {
    case 'idle':
      return '대기 중 · 다음 배치를 기다림';
    case 'filling':
      return `${name}파지를 받는 중`;
    case 'pressing':
      return batch ? `${name}압축 중 · 목표 ${formatPressureMpa(batch.targetPressureMpa)}` : '압축 중';
    case 'ejecting':
      return '베일 결속·배출 중';
  }
}

/** 지금/다음 줄에 적는 배치 요약 */
export const batchLine = (batch: Batch): string =>
  `배치 ${shortId(batch.id)} · ${mixPercentText(batch)} · 목표 ${formatPressureMpa(batch.targetPressureMpa)}`;
