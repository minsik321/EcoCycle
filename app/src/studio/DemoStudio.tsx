import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { demoSource } from '../scene/robot/jointSource';
import { StudioView } from './StudioView';
import { useDemoData } from './demo/demoData';
import { studioStats } from './three/stats';

/** 측정용: 한 프레임에 그린 횟수와 삼각형 수를 1초마다 읽는다 */
function useDrawStats(): { calls: number; triangles: number } {
  const [stats, setStats] = useState({ calls: 0, triangles: 0 });
  useEffect(() => {
    const timer = setInterval(() => setStats({ calls: studioStats.calls, triangles: studioStats.triangles }), 1000);
    return () => clearInterval(timer);
  }, []);
  return stats;
}

/**
 * /scene-demo의 스튜디오: 서버·로그인 없이 예시 원본으로 돌린다. 값은 전부 "예시 데이터"이고 조작 버튼은 없다.
 */
export function DemoStudio({ tabs, disconnected, paused, onFailed }: { tabs?: ReactNode; disconnected: boolean; paused: boolean; onFailed: () => void }) {
  const { data, startMs, lastReceivedAt } = useDemoData(disconnected);
  const jointSource = useMemo(() => demoSource(startMs), [startMs]);
  const draw = useDrawStats();
  const slot = (
    <>
      {tabs}
      <span className="st-fps" role="status" aria-label="그리기 측정">
        그리기 {draw.calls}회 · 삼각형 {Math.round(draw.triangles / 1000)}천
      </span>
    </>
  );
  return <StudioView data={data} jointSource={jointSource} disconnected={disconnected} lastReceivedAt={lastReceivedAt} paused={paused} example tabs={slot} onFailed={onFailed} />;
}
