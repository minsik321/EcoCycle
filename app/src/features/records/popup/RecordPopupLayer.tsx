import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { parsePopupPath, popupPath, popupState, readPopupMeta, recordsBackground } from '../../../components/records/recordPopup';
import type { BackgroundLocation, PopupTarget } from '../../../components/records/recordPopup';
import { recordPopupToggled } from '../../../store';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { RecordPopup } from './RecordPopup';

interface Shown {
  target: PopupTarget;
  previous: PopupTarget | null;
  background: BackgroundLocation;
}

const sameScreen = (a: { pathname: string; search: string }, b: BackgroundLocation) => a.pathname === b.pathname && a.search === b.search;

/**
 * 기록 상세 팝업(차량·배치·베일)의 계층. 화면(Routes)은 팝업 뒤에 깔린 주소로 그리고, 그 위에 팝업 하나를 띄운다.
 *
 * 기록(history) 규칙 — 앱이 기억하는 팝업은 최대 둘(지금 것과 바로 전 것), 화면 기록에는 팝업 칸이 늘 하나뿐이다:
 * - 화면에서 열기: 팝업 주소를 하나 쌓는다(push). 기록 상태에 뒤 화면을 적는다(`components/records/recordPopup`).
 * - 팝업 안에서 이어 열기(베일 → 배치 보기 등): 같은 칸을 바꾼다(replace). 바로 전 것 = 지금 것, 지금 것 = 새것, 그보다 앞은 잊는다.
 * - 닫기(닫기 버튼·바깥 누르기·Esc): 바로 전 것이 있으면 그것으로 바꾸고(replace), 없으면 뒤로 한 칸(뒤 화면).
 * - 뒤로 가기(브라우저·안드로이드 뒤로 버튼 → popstate): 뒤 화면으로 돌아오는데, 바로 전 팝업이 있었으면 곧바로 그것을 다시 쌓아 보인다.
 *   그래서 뒤로 가기도 지금 팝업 하나만 닫는다.
 * - 상세 주소를 바로 연 경우(깊은 링크·새로고침 전 상태 없음): 그 종류의 공정 기록 탭을 뒤에 깔고, 기록을 [공정 기록, 팝업]으로 고친다.
 * 로그인 전에는 아무것도 하지 않는다(로그인 화면이 원래 주소를 기억했다가 돌아온다).
 */
export function RecordPopupLayer({ children }: { children: (location: BackgroundLocation) => ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const dispatch = useAppDispatch();
  const loggedIn = useAppSelector((state) => state.auth.status === 'loggedIn');
  /** 마지막으로 보인 팝업 (뒤로 가기로 닫혔을 때 바로 전 것을 되살리려고) */
  const lastShown = useRef<Shown | null>(null);
  /** 기록을 고친 주소 (StrictMode처럼 효과가 두 번 돌아도 같은 주소에서 두 번 쌓지 않게) */
  const handledKey = useRef<string | null>(null);

  const target = loggedIn ? parsePopupPath(location.pathname) : null;
  const meta = target ? readPopupMeta(location.state) : null;
  let shown: Shown | null = target ? { target, previous: meta?.previous ?? null, background: meta?.background ?? recordsBackground(target.kind) } : null;
  // 뒤로 가기로 뒤 화면에 돌아왔는데 바로 전 팝업이 있었다: 그것을 곧바로 보인다(아래 효과가 기록에도 다시 쌓는다)
  const last = lastShown.current;
  const restoring = !shown && loggedIn && navigationType === 'POP' && last?.previous != null && sameScreen(location, last.background);
  if (restoring && last?.previous) shown = { target: last.previous, previous: null, background: last.background };

  useEffect(() => {
    if ((target && !meta) || restoring) {
      if (handledKey.current === location.key) return;
      handledKey.current = location.key;
    }
    if (target && !meta) {
      // 상세 주소를 바로 열었다: [공정 기록, 팝업]으로 고쳐 뒤로 가기·닫기가 공정 기록으로 돌아가게 한다
      const background = recordsBackground(target.kind);
      navigate(background.pathname + background.search, { replace: true });
      navigate(popupPath(target), { state: popupState(background) });
      return;
    }
    if (restoring && shown) {
      navigate(popupPath(shown.target), { state: popupState(shown.background) });
      return;
    }
    lastShown.current = target ? shown : null;
    // location.key가 바뀔 때만 (같은 주소의 다시 그리기는 무시)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, loggedIn]);

  const open = shown !== null;
  useEffect(() => {
    dispatch(recordPopupToggled(open));
  }, [dispatch, open]);
  useEffect(() => () => void dispatch(recordPopupToggled(false)), [dispatch]);

  const close = () => {
    if (!shown) return;
    if (shown.previous) navigate(popupPath(shown.previous), { replace: true, state: popupState(shown.background) });
    else if (meta) navigate(-1);
    else navigate(shown.background.pathname + shown.background.search, { replace: true });
  };
  const openLinked = (next: PopupTarget) => {
    if (!shown) return;
    navigate(popupPath(next), { replace: true, state: popupState(shown.background, shown.target) });
  };

  return (
    <>
      {children(shown ? shown.background : location)}
      {shown && <RecordPopup key={`${shown.target.kind}:${shown.target.id}`} target={shown.target} previous={shown.previous} onClose={close} onOpen={openLinked} />}
    </>
  );
}
