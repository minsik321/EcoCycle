import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { clearLoginError, loginUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { SessionCheck } from './RequireAuth';
import { loginErrorMessage } from './messages';

/** 로그인 시도 제한(429)이 걸렸을 때 남은 초를 센다. 0이 되면 다시 시도할 수 있다. */
function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!seconds) {
      setLeft(0);
      return;
    }
    setLeft(seconds);
    const timer = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}

export function LoginPage() {
  const dispatch = useAppDispatch();
  const { status, loginPending, loginError, sessionExpired } = useAppSelector((state) => state.auth);

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  // 자동 로그인: 기본은 끔. 켜면 새로고침·앱을 다시 켜도 비밀번호를 묻지 않는다(웹 14일 쿠키, 안드로이드 보안 저장소)
  const [remember, setRemember] = useState(false);
  const [emptyError, setEmptyError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // 서버가 429로 알려 준 대기 시간 동안은 다시 누를 수 없게 한다
  const waitSec = useCountdown(loginError?.status === 429 ? (loginError.retryAfterSec ?? null) : null);

  // 실패하면 비밀번호는 지우고 다시 입력하게 한다 (아이디는 남긴다)
  useEffect(() => {
    if (loginError) {
      setPassword('');
      passwordRef.current?.focus();
    }
  }, [loginError]);

  if (status === 'unknown') return <SessionCheck />;
  if (status === 'loggedIn') {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (loginPending || waitSec > 0) return;
    if (!id.trim() || !password) {
      setEmptyError(true);
      return;
    }
    setEmptyError(false);
    void dispatch(loginUser({ id: id.trim(), password, remember }));
  };

  const message = emptyError
    ? loginErrorMessage({ code: 'VALIDATION_FAILED', message: '', status: 422 })
    : loginError
      ? loginErrorMessage({ ...loginError, ...(waitSec > 0 ? { retryAfterSec: waitSec } : {}) })
      : null;

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900">EcoCycle</h1>
        <p className="mt-1 text-sm text-slate-600">스마트 폐지 처리 대시보드</p>

        {sessionExpired && (
          <p role="status" className="mt-4 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            로그인 시간이 지나 다시 로그인해야 합니다.
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            아이디
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setEmptyError(false);
                if (loginError) dispatch(clearLoginError());
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="min-h-12 rounded-lg border border-slate-400 px-3 text-base text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            비밀번호
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setEmptyError(false);
              }}
              autoComplete="current-password"
              className="min-h-12 rounded-lg border border-slate-400 px-3 text-base text-slate-900"
            />
          </label>

          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-5 shrink-0 accent-slate-900"
            />
            자동 로그인
          </label>

          {message && (
            <p role="alert" className="rounded-lg border border-status-alarm bg-red-50 px-3 py-2 text-sm font-medium text-status-alarm">
              <span aria-hidden="true">✕ </span>
              {message}
            </p>
          )}

          <Button type="submit" variant="primary" loading={loginPending} disabled={waitSec > 0}>
            {waitSec > 0 ? `${waitSec}초 뒤에 다시 시도` : '로그인'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
