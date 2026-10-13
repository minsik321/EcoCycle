import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Timestamp } from '../../components/status/Timestamp';
import { API_BASE, APP_VERSION, USE_MOCK } from '../../config/env';
import { PERMISSION_TEXT, ROLE_TEXT } from '../../config/display';
import { QUALITY_TEXT, QUALITY_TIERS } from '../../config/quality';
import { logoutUser, qualityAutoRequested, qualityModeChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectConnection, selectMe } from '../../store/selectors';

const CONNECTION_TEXT = { online: '연결됨', connecting: '연결하는 중', offline: '연결 끊김' } as const;

/** 설정 화면: 계정, 화질 모드(고화질/기본/저사양, 자동 선택), 앱 정보. */
export function SettingsPage() {
  const dispatch = useAppDispatch();
  const me = useAppSelector(selectMe);
  const quality = useAppSelector((state) => state.ui.qualityMode);
  const qualityAuto = useAppSelector((state) => state.ui.qualityAuto);
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
          {QUALITY_TIERS.map((tier) => (
            <label
              key={tier}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-control border p-3 ${quality === tier ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
            >
              <input
                type="radio"
                name="quality"
                value={tier}
                checked={quality === tier}
                onChange={() => dispatch(qualityModeChanged(tier))}
                className="mt-1 h-5 w-5 accent-accent"
              />
              <span className="flex flex-col">
                <span className="font-semibold text-ink">{QUALITY_TEXT[tier].label}</span>
                <span className="text-sm text-ink-soft">{QUALITY_TEXT[tier].help}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => dispatch(qualityAutoRequested())} disabled={qualityAuto}>
            자동으로 다시 고르기
          </Button>
          <p className="text-xs text-ink-faint">
            {qualityAuto ? '이 기기의 성능을 재는 중입니다…' : '처음 열 때 기기 성능을 짧게 재서 자동으로 고릅니다. 고른 값은 이 기기에 기억됩니다.'}
          </p>
        </div>
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
