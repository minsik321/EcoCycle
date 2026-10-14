import { Card } from '../../components/common/Card';
import { formatAngleDeg } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectIsDisconnected } from '../../store/selectors';
import { useRobotModel, useJointReading } from './useRobot';

/** 관절 값이 이 시간(ms) 넘게 안 들어오면 "늦어지고 있다"고 알린다 */
const SLOW_MS = 3_000;

/**
 * 로봇 관절 각도(도) 표. 관절 순서·이름·각도 범위는 로봇 모델을 따르고, 값은 받은 그대로 보여 준다(변환하지 않는다).
 * 연결이 끊기면 마지막 값을 흐리게 두고 "마지막 값"이라고 알린다.
 */
export function JointTable() {
  const model = useRobotModel();
  const { sample, ageMs } = useJointReading();
  const disconnected = useAppSelector(selectIsDisconnected);
  const slow = !disconnected && ageMs !== null && ageMs > SLOW_MS;

  return (
    <Card title="관절 값 (도)" aria-label="관절 값">
      {sample === null ? (
        <p role="status" className="text-slate-500">
          {disconnected ? '연결이 끊겨 관절 값을 받을 수 없습니다.' : '관절 값을 기다리는 중…'}
        </p>
      ) : (
        <>
          {(disconnected || slow) && (
            <p role="status" className="mb-2 text-sm font-medium text-slate-600">
              {disconnected ? '마지막으로 받은 값입니다.' : '관절 값 수신이 늦어지고 있습니다.'}
            </p>
          )}
          <table className={`w-full text-left ${disconnected ? 'opacity-50' : ''}`}>
            <thead>
              <tr className="text-sm text-slate-500">
                <th scope="col" className="py-1 font-medium">관절</th>
                <th scope="col" className="py-1 font-medium">각도</th>
                <th scope="col" className="py-1 font-medium">범위</th>
                {/* 폰에서는 칸이 모자라 막대(각도·범위 숫자를 그림으로 보인 것)를 뺀다 */}
                <th scope="col" className="hidden w-1/3 py-1 font-medium sm:table-cell">
                  <span className="sr-only">범위 안 위치</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {model.joints.map((joint, i) => {
                const value = sample.joints[i];
                const span = joint.maxDeg - joint.minDeg;
                const pct = value === undefined || span <= 0 ? 0 : Math.min(100, Math.max(0, ((value - joint.minDeg) / span) * 100));
                return (
                  <tr key={joint.name} className="border-t border-slate-100">
                    <th scope="row" className="py-2 pr-3 font-medium text-slate-800">
                      {i + 1}. {joint.name}
                    </th>
                    <td className="py-2 pr-3 text-lg font-semibold whitespace-nowrap text-slate-900 tabular-nums">{value === undefined ? '–' : formatAngleDeg(value)}</td>
                    <td className="py-2 pr-3 text-sm whitespace-nowrap text-slate-500 tabular-nums">
                      {joint.minDeg}° ~ {joint.maxDeg}°
                    </td>
                    <td className="hidden py-2 sm:table-cell">
                      <div
                        role="meter"
                        aria-label={`${joint.name} 범위 안 위치`}
                        aria-valuemin={joint.minDeg}
                        aria-valuemax={joint.maxDeg}
                        aria-valuenow={value ?? joint.zeroDeg}
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                      >
                        <div className="h-full bg-slate-700" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            그리퍼: {sample.gripper.holding ? '파지를 잡고 있음' : sample.gripper.closed ? '닫힘' : '열림'}
          </p>
        </>
      )}
    </Card>
  );
}
