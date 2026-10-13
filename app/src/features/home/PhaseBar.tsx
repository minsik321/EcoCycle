import type { CompressorState, DeviceStatus, RobotState } from '@ecocycle/shared';
import { StatusBadge } from '../../components/status/StatusBadge';
import { TONE_CLASS } from '../../components/status/tone';
import { PHASE_STEPS, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';

/**
 * 홈 하단 단계 바: 집기 → 이동 → 놓기 → 압축.
 * - 집기·이동·놓기는 로봇의 `phase`를 따라 지금 단계가 강조된다.
 * - 정지·오류·일시정지·연결 끊김이면 바 전체와 상태 표시가 그 색으로 바뀐다.
 * - 사이클 시간처럼 계속 바뀌는 숫자는 넣지 않는다.
 * - "압축"은 로봇 phase에 없어서 압축기의 가동 상태를 보여 준다 (서버에 확인 필요: docs/questions.md B20).
 */
export function PhaseBar() {
  const robot = useAppSelector(selectDevice('robot-1')) as RobotState | undefined;
  const compressor = useAppSelector(selectDevice('compressor-1')) as CompressorState | undefined;
  const { disconnected, show } = useDisplayStatus();

  if (!robot) {
    return (
      <div role="group" aria-label="작업 단계" className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-500">
        작업 단계를 불러오는 중…
      </div>
    );
  }

  const barTone: DeviceStatus = show(ROBOT_STATUS_TONE[robot.status]);
  const working = robot.status === 'running';
  const problem = barTone !== 'normal';

  return (
    <div
      role="group"
      aria-label="작업 단계"
      data-tone={barTone}
      className={`flex flex-wrap items-center gap-3 rounded-xl border-2 bg-white p-3 ${problem ? TONE_CLASS[barTone] : 'border-slate-200'}`}
    >
      <StatusBadge status={barTone} label={disconnected ? undefined : ROBOT_STATUS_TEXT[robot.status]} />
      <ol className="flex flex-1 flex-wrap items-center gap-2">
        {PHASE_STEPS.map((step, index) => {
          const isCompress = step.phase === null;
          const active = !isCompress && working && !disconnected && robot.phase === step.phase;
          const compressorTone: DeviceStatus = compressor ? show(compressor.status) : 'offline';
          return (
            <li key={step.key} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="text-slate-400">→</span>}
              <span
                aria-current={active ? 'step' : undefined}
                className={`inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-base font-semibold ${
                  active ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                {step.label}
                {isCompress && compressor && (
                  <span className={`rounded-full border px-2 text-xs ${TONE_CLASS[compressorTone]}`}>
                    {disconnected ? '연결 끊김' : compressor.running ? '가동' : '정지'}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
