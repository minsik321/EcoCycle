export interface SparklineProps {
  /** 오래된 값부터 */
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * 지표 카드의 작은 추이선. 받은 값을 그대로 선으로만 그린다(축·눈금 없음, 꾸밈 요소라 화면 읽기에서는 숨긴다).
 * 값이 2개보다 적으면 아무것도 그리지 않는다.
 */
export function Sparkline({ values, width = 96, height = 32, className = '' }: SparklineProps) {
  if (values.length < 2) return <svg aria-hidden="true" width={width} height={height} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1] as number;
  const endX = x(values.length - 1);
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <path d={`${line} L${endX.toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`} className="fill-accent-soft" />
      <path d={line} fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />
      <circle cx={endX} cy={y(last)} r="2.5" className="fill-accent" />
    </svg>
  );
}
