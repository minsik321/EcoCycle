import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { QUALITY_TIERS, tierFromProbe } from '../config/quality';
import type { QualityTier } from '../config/quality';
import { demoSource } from './robot/jointSource';
import { measureFps } from '../store/qualityProbe';
import { StudioView } from './StudioView';
import { useDemoData } from './demo/demoData';
import { TIER_LABEL } from './quality';
import { studioStats } from './three/stats';
import { useStudioTier } from './useStudioTier';

/** 측정용: 한 프레임에 그린 횟수와 삼각형 수를 1초마다 읽는다 */
function useDrawStats(): { calls: number; triangles: number } {
  const [stats, setStats] = useState({ calls: 0, triangles: 0 });
  useEffect(() => {
    const timer = setInterval(() => setStats({ calls: studioStats.calls, triangles: studioStats.triangles }), 1000);
    return () => clearInterval(timer);
  }, []);
  return stats;
}

const DEVICE_LABEL = { phone: '폰', tablet: '태블릿', desktop: '데스크톱' } as const;

/** 주소의 ?tier=high|standard|low (측정 스크립트가 단계를 고정할 때) */
function tierFromUrl(): QualityTier | null {
  const value = new URLSearchParams(window.location.search).get('tier');
  return (QUALITY_TIERS as readonly string[]).includes(value ?? '') ? (value as QualityTier) : null;
}

/**
 * /scene-demo의 스튜디오: 서버·로그인 없이 예시 원본으로 돌린다. 값은 전부 "예시 데이터"이고 조작 버튼은 없다.
 * 화질은 홈과 같은 규칙으로 고른다(기기 종류 기본값 + 짧은 측정으로 한 단계까지). 측정을 위해 단계를 직접 고를 수도 있다.
 */
export function DemoStudio({ tabs, disconnected, paused, onFailed }: { tabs?: ReactNode; disconnected: boolean; paused: boolean; onFailed: () => void }) {
  const { data, startMs, lastReceivedAt } = useDemoData(disconnected);
  const jointSource = useMemo(() => demoSource(startMs), [startMs]);
  const draw = useDrawStats();
  const [probed, setProbed] = useState<QualityTier | null>(null);
  const [chosen, setChosen] = useState<QualityTier | null>(tierFromUrl);
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const { tier, device } = useStudioTier(probed, chosen);

  // 짧은 측정은 첫 화면이 나온 뒤에 한 번 (불러오는 동안 재면 실제보다 낮게 나온다)
  const ready = firstFrameMs !== null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void measureFps().then((fps) => {
        if (!cancelled && fps !== null) setProbed(tierFromProbe(fps, navigator.hardwareConcurrency));
      });
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready]);

  const slot = (
    <>
      {tabs}
      <span className="st-demo-tier" role="group" aria-label="스튜디오 화질">
        <button type="button" className="st-aux" aria-pressed={chosen === null} onClick={() => setChosen(null)}>
          자동
        </button>
        {QUALITY_TIERS.map((t) => (
          <button key={t} type="button" className="st-aux" aria-pressed={chosen === t} onClick={() => setChosen(t)}>
            {TIER_LABEL[t]}
          </button>
        ))}
      </span>
      <span className="st-fps" role="status" aria-label="그리기 측정" data-tier={tier} data-first-frame={firstFrameMs ?? undefined}>
        {DEVICE_LABEL[device]} · {TIER_LABEL[tier]}
        {probed ? ` (측정 ${TIER_LABEL[probed]})` : ''} · 첫 화면 {firstFrameMs === null ? '–' : `${(firstFrameMs / 1000).toFixed(1)}초`} · 그리기 {draw.calls}회 · 삼각형 {Math.round(draw.triangles / 1000)}천
      </span>
    </>
  );
  return (
    <StudioView
      data={data}
      jointSource={jointSource}
      tier={tier}
      onFirstFrame={(ms) => setFirstFrameMs((prev) => prev ?? Math.round(ms))}
      disconnected={disconnected}
      lastReceivedAt={lastReceivedAt}
      paused={paused}
      example
      tabs={slot}
      onFailed={onFailed}
    />
  );
}
