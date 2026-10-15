import { Card } from '../../components/common/Card';
import { DeviceControls } from '../../components/controls/DeviceControls';
import { SettingForm } from '../../components/controls/SettingForm';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';
import { DEVICE_NAMES, PHASE_STEPS, ROBOT_MODE_TEXT, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE } from '../../config/display';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { useRobotJointsSubscription } from '../../store/useRealtime';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { PickRecords } from './PickRecords';
import { JointTable } from './JointTable';

function Fact({ label, value, dim, className }: { label: string; value: string; dim: boolean; className?: string }) {
  return (
    <Card title={label} className={className}>
      <p className={`text-xl font-bold ${dim ? 'text-ink-faint' : 'text-ink'}`}>{value}</p>
    </Card>
  );
}

/**
 * 로봇팔 기기 페이지: 현재 상태, 수동 조작, 관절 값, 설정, 오류 로그, 사이클 통계.
 * 위험도 높은 조작(모드 전환, 탱크 지정 집기)은 여기서만, 확인 단계를 거쳐 보낸다.
 * 관절 값은 이 페이지에 있는 동안에만 구독한다.
 */
export function RobotPage() {
  useRobotJointsSubscription();
  const robot = useAppSelector(selectDevice('robot-1'));
  const { disconnected, show } = useDisplayStatus();
  const r = robot?.type === 'robot' ? robot : null;
  const tone = r ? show(ROBOT_STATUS_TONE[r.status]) : 'offline';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{DEVICE_NAMES['robot-1']}</h1>
        {r && <StatusBadge status={tone} label={disconnected ? undefined : ROBOT_STATUS_TEXT[r.status]} />}
        {r && (
          <span className="text-xs text-ink-faint">
            {disconnected ? '마지막으로 받은 값 · ' : ''}마지막 갱신 <Timestamp iso={r.updatedAt} />
          </span>
        )}
      </div>

      {!r ? (
        <p role="status" className="text-ink-faint">
          로봇 상태를 불러오는 중…
        </p>
      ) : (
        <section aria-label="현재 상태" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="모드" value={disconnected ? '–' : ROBOT_MODE_TEXT[r.mode]} dim={disconnected} className="sm:col-span-2" />
          <Fact label="동작 단계" value={disconnected ? '–' : PHASE_STEPS.find((s) => s.phase === r.phase)?.label ?? '대기'} dim={disconnected} />
          <Fact label="작업 중 섹터" value={disconnected ? '–' : r.targetTankId ? DEVICE_NAMES[r.targetTankId] : '없음'} dim={disconnected} />
        </section>
      )}

      <Card title="조작" aria-label="조작">
        <DeviceControls deviceId="robot-1" context="page" />
        <p className="mt-3 text-xs text-ink-faint">
          정지는 일반 정지이며 안전 장치가 아닙니다. 비상정지는 현장의 물리 버튼과 안전 장치가 맡습니다.
        </p>
      </Card>

      <JointTable />

      <Card title="설정" aria-label="설정" className="flex flex-col gap-4">
        {DEVICE_SETTINGS.robot.map((field) => (
          <SettingForm key={field.key} deviceId="robot-1" field={field} />
        ))}
      </Card>

      <DeviceAlarmHistory deviceId="robot-1" title="오류 로그 (최근 7일)" />

      <Card title="사이클 통계" aria-label="사이클 통계">
        <p className="text-slate-600">
          사이클 횟수와 평균 시간은 서버가 값을 제공해야 표시할 수 있습니다. 현재 API 명세에는 이 값이 없어 서버 담당과 확인 중입니다.
        </p>
      </Card>
      <PickRecords revision={r?.pickRecordsRevision ?? 0} />
    </div>
  );
}
