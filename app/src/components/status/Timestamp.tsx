import { formatLocalTime } from '../../config/display';

export interface TimestampProps {
  /** ISO 8601 UTC 문자열 (서버 값 그대로) */
  iso: string | null | undefined;
  withSeconds?: boolean;
  className?: string;
}

/** 시각은 표시할 때만 현지 시각으로 바꾼다. */
export function Timestamp({ iso, withSeconds = true, className }: TimestampProps) {
  if (!iso) return <span className={className}>-</span>;
  return (
    <time dateTime={iso} className={className}>
      {formatLocalTime(iso, withSeconds)}
    </time>
  );
}
