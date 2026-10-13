import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Timestamp } from '../../components/status/Timestamp';
import { API_BASE, APP_VERSION, USE_MOCK } from '../../config/env';
import { PERMISSION_TEXT, ROLE_TEXT } from '../../config/display';
import { logoutUser, qualityModeChanged } from '../../store';
import type { QualityMode } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectConnection, selectMe } from '../../store/selectors';

const QUALITY_OPTIONS: ReadonlyArray<{ value: QualityMode; label: string; help: string }> = [
  { value: 'standard', label: '기본', help: '3D 화면을 부드럽게 그립니다.' },
  { value: 'low', label: '저사양', help: '3D 화면의 연출과 그리는 횟수를 줄여 태블릿의 발열과 끊김을 낮춥니다.' },
];

const CONNECTION_TEXT = { online: '연결됨', connecting: '연결하는 중', offline: '연결 끊김' } as const;

/** 설정 화면: 계정, 화질 모드(기본/저사양), 앱 정보. */
export function SettingsPage() {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const quality = useAppSelector((state) => state.ui.qualityMode);
  const connection = useAppSelector(selectConnection);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">설정</h1>

      <Card title="계정" aria-label="계정">
        {me ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-sm text-slate-600">이름</dt>
              <dd className="font-semibold">{me.name}</dd>
              <dt className="text-sm text-slate-600">아이디</dt>
              <dd className="font-semibold">{me.id}</dd>
              <dt className="text-sm text-slate-600">권한</dt>
              <dd className="font-semibold">{ROLE_TEXT[me.role]}</dd>
            </dl>
            <div>
              <p className="text-sm text-slate-600">할 수 있는 조작</p>
              {me.permissions.length === 0 ? (
                <p className="font-medium text-slate-800">조회만 할 수 있습니다.</p>
              ) : (
                <ul className="list-disc pl-5 text-slate-800">
                  {me.permissions.map((p) => (
                    <li key={p}>{PERMISSION_TEXT[p]}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-slate-500">실제로 할 수 있는 조작은 서버가 다시 확인합니다.</p>
            </div>
            <div>
              <Button onClick={() => void dispatch(logoutUser())}>로그아웃</Button>
            </div>
          </div>
        ) : (
          <p className="text-slate-500">계정 정보를 불러오는 중…</p>
        )}
      </Card>

      <Card title="화질 모드" aria-label="화질 모드">
        <div role="radiogroup" aria-label="화질 모드" className="flex flex-col gap-2">
          {QUALITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 ${quality === option.value ? 'border-slate-800 bg-slate-50' : 'border-slate-300'}`}
            >
              <input
                type="radio"
                name="quality"
                value={option.value}
                checked={quality === option.value}
                onChange={() => dispatch(qualityModeChanged(option.value))}
                className="mt-1 h-5 w-5"
              />
              <span className="flex flex-col">
                <span className="font-semibold text-slate-900">{option.label}</span>
                <span className="text-sm text-slate-600">{option.help}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">이 기기에 기억됩니다. 3D 홈 화면에서 적용되고, 지금의 2D 화면에는 영향이 없습니다.</p>
      </Card>

      <Card title="앱 정보" aria-label="앱 정보">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
          <dt className="text-sm text-slate-600">버전</dt>
          <dd className="font-semibold">{APP_VERSION}</dd>
          <dt className="text-sm text-slate-600">서버</dt>
          <dd className="break-all font-semibold">{API_BASE}</dd>
          <dt className="text-sm text-slate-600">서버 종류</dt>
          <dd className="font-semibold">{USE_MOCK ? '모의 서버(개발용)' : '실서버'}</dd>
          <dt className="text-sm text-slate-600">연결 상태</dt>
          <dd className="font-semibold">
            {CONNECTION_TEXT[connection.status]}
            {connection.lastReceivedAt && (
              <span className="ml-2 text-sm font-normal text-slate-600">
                마지막 수신 <Timestamp iso={connection.lastReceivedAt} />
              </span>
            )}
          </dd>
        </dl>
      </Card>
    </div>
  );
}
