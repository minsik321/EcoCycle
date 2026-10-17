import type { TankId } from '@ecocycle/shared';
import { sectorsText } from '../../config/processDisplay';

/**
 * 실제 배합이 있는 배치의 표시: 지금 지정 중이면 "섹터 지정 중 · A1 · B1", 그 외에는 "실제 배합 반영".
 * 지정 여부·섹터는 서버 값(`Batch.pinning`, `actualMix`)이다.
 */
export function PinBadge({ pinning, actual }: { pinning: { sectors: readonly TankId[] } | null; actual: boolean }) {
  if (!pinning && !actual) return null;
  return (
    <span className="inline-flex min-w-0 items-center rounded-full bg-safety/25 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink">
      <span className="truncate">{pinning ? `섹터 지정 중 · ${sectorsText(pinning.sectors)}` : '실제 배합 반영'}</span>
    </span>
  );
}
