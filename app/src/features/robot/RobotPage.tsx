import type { RobotState } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { RobotModeControl } from '../../components/controls/RobotModeControl';
import { SettingForm } from '../../components/controls/SettingForm';
import { DeviceActionBar } from '../../components/device/ActionBar';
import { DetailsSection } from '../../components/device/DetailsSection';
import { DeviceHero } from '../../components/device/DeviceHero';
import { DevicePage } from '../../components/device/DevicePage';
import { KeyTiles } from '../../components/device/KeyTile';
import { useDeviceLive } from '../../components/device/live';
import { NowNext } from '../../components/device/NowNext';
import { ROBOT_DIAGNOSTICS_PERMISSION } from '../../config/controls';
import { DEVICE_NAMES, ROBOT_MODE_SHORT_TEXT, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE, formatCount, gripperText } from '../../config/display';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectCan, selectDevice } from '../../store/selectors';
import { useRobotJointsSubscription } from '../../store/useRealtime';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { ArmSilhouette } from './ArmSilhouette';
import { JointTable } from './JointTable';
import { PickRecords } from './PickRecords';
import { robotActivity, robotNowNext, robotTaskShort } from './robotText';
import { usePicksThisHour } from './usePicksThisHour';
import { useRobotModel } from './useRobot';

/**
 * 로봇팔 기기 페이지 (DevicePage 틀): 맨 위 실시간 옆모습, 주요 수치(모드·현재 작업·이번 시간 집기·그리퍼), 지금/다음,
 * 운전 모드(자동 | 자동 · 섹터 지정 | 수동, 위험 조작이라 확인 단계), 자세히(진단·설정·오류 로그), 맨 아래 사이클 통계와 집기 기록.
 * 관절 값은 이 페이지에 있는 동안에만 구독한다(옆모습과 진단 표가 쓴다).
 */
export function RobotPage() {
  useRobotJointsSubscription();
  const device = useAppSelector(selectDevice('robot-1'));
  const batches = useAppSelector((state) => state.process.batches);
  const canDiagnose = useAppSelector(selectCan(ROBOT_DIAGNOSTICS_PERMISSION));
  const { disconnected } = useDeviceLive();
  const model = useRobotModel();
  const robot = device?.type === 'robot' ? (device as RobotState) : null;
  const picks = usePicksThisHour(robot?.pickRecordsRevision ?? 0, !disconnected && !!robot);
  const plan = robot ? robotNowNext(robot, batches) : { now: null, next: null };

  return (
    <DevicePage
      hero={
        <DeviceHero
          name={DEVICE_NAMES['robot-1']}
          status={robot ? ROBOT_STATUS_TONE[robot.status] : null}
          statusLabel={robot ? ROBOT_STATUS_TEXT[robot.status] : undefined}
          activity={robot ? robotActivity(robot) : null}
          updatedAt={robot?.updatedAt ?? null}
          illustration={<ArmSilhouette model={model} frozen={disconnected} />}
        />
      }
      tiles={
        <KeyTiles
          tiles={[
            { label: '모드', value: robot ? ROBOT_MODE_SHORT_TEXT[robot.mode] : null, kind: 'text' },
            { label: '현재 작업', value: robot ? robotTaskShort(robot) : null, kind: 'text' },
            { label: '이번 시간 집기', value: picks === null ? null : formatCount(picks), unit: '회' },
            { label: '그리퍼', value: robot ? gripperText(robot.gripper) : null, kind: 'text' },
          ]}
        />
      }
      now={
        <>
          <NowNext now={plan.now} next={plan.next} />
          <RobotModeControl />
        </>
      }
      actions={<DeviceActionBar deviceId="robot-1" />}
      details={
        <DetailsSection>
          {canDiagnose && <JointTable title="진단 · 관절 값 (도)" />}
          <Card title="설정" aria-label="설정" className="flex flex-col gap-4">
            {DEVICE_SETTINGS.robot.map((field) => (
              <SettingForm key={field.key} deviceId="robot-1" field={field} />
            ))}
          </Card>
          <DeviceAlarmHistory deviceId="robot-1" title="오류 로그 (최근 7일)" />
          <p className="text-xs text-ink-faint">정지는 일반 정지이며 안전 장치가 아닙니다. 비상정지는 현장의 물리 버튼과 안전 장치가 맡습니다.</p>
        </DetailsSection>
      }
      records={
        <div className="flex flex-col gap-3 md:gap-4">
          <Card title="사이클 통계" aria-label="사이클 통계">
            <p className="text-slate-600">
              사이클 횟수와 평균 시간은 서버가 값을 제공해야 표시할 수 있습니다. 현재 API 명세에는 이 값이 없어 서버 담당과 확인 중입니다.
            </p>
          </Card>
          <PickRecords revision={robot?.pickRecordsRevision ?? 0} />
        </div>
      }
    />
  );
}
