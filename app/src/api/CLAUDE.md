# app/src/api — REST 클라이언트, 인증, 명령

서버와의 REST 통신을 한곳에 모은다. 화면 코드는 `fetch`를 직접 부르지 않고 이 폴더의 함수·훅만 쓴다.

## 파일

```
api/
├── http.ts         기본 요청 함수: 기본 주소, Bearer 헤더, JSON, 오류 형식 변환, 401 처리
├── tokens.ts       액세스 토큰(메모리), 리프레시 토큰 저장소 인터페이스 하나 + 구현 둘: 웹 쿠키(기본)·안드로이드 보안 저장소
├── auth.ts         login(자동 로그인 remember), logout, getMe, getWsTicket, restoreSession(앱 시작 때 리프레시 → /me)
│                   (요청 중 401 때의 refresh는 http.ts가 자동 실행, refreshSession은 알림 없이 한 번만)
├── devices.ts      getPlantSummary, getDevices, getDeviceState, getHistory, getRobotModel
├── alarms.ts       getAlarms
├── cameras.ts      getCameras, getStreamInfo, getSnapshotBlob (이미지는 토큰을 주소에 넣을 수 없어 Blob으로 받음)
├── push.ts         registerPush, unregisterPush
├── commands.ts     sendCommand(Idempotency-Key 생성), getCommand
└── index.ts        재수출
```

## 규칙

- 기본 주소는 `config/env.ts`의 `API_BASE`(`https://{server}/api/v1`). 모의 서버와 실서버는 주소만 다르다.
- 요청·응답 타입은 `@ecocycle/shared`에서 가져온다. 여기서 응답 모양을 따로 정의하지 않는다.
- 상태 코드 처리(명세 6.1):
  - 401 → 리프레시로 재발급 후 원래 요청 1회 재시도. 동시에 여러 요청이 401이면 **리프레시는 한 번만** 실행하고 나머지는 기다린다. 리프레시도 실패하면 로그아웃 → 로그인 화면.
  - 리프레시 토큰은 사용할 때마다 교체되므로 응답의 새 토큰으로 즉시 바꾼다.
  - 403 조작 거부 / 409 이유 표시 / 422 입력 오류 / 429 잠시 대기 후 재시도 / 503 연결 끊김 표시.
  - 오류는 `{ code, message, status }` 형태의 `ApiError`로 통일해 던진다. 서버에 닿지 못하면 status 0(`NETWORK_ERROR`), `isUnavailable(error)`로 0·503을 연결 끊김으로 판단한다.
  - 429는 GET과 Idempotency-Key가 있는 명령만 `Retry-After`만큼 기다렸다가 최대 2번 다시 시도하고, 대기가 5초를 넘으면(로그인 시도 제한 등) 바로 오류를 낸다.
  - 리프레시가 서버에 거부(4xx)되면 토큰을 지우고 `setAuthLostHandler`로 등록된 곳(store)에 알린다. api는 store를 import하지 않는다. 네트워크 오류·5xx로는 로그아웃하지 않는다.
- 토큰 보관(명세 6절 "토큰 보관과 자동 로그인", `docs/decisions.md` 2026-10-15): 액세스 토큰은 메모리에만. 리프레시 토큰은
  - 웹(`createCookieTokenStore`, 기본): 서버가 HttpOnly 쿠키로 보관한다. 스크립트는 토큰을 보지 않는다. 로그인·리프레시·로그아웃만 `withCredentials`(`credentials: 'include'`)로 보낸다.
  - 안드로이드(`createNativeTokenStore(secure)`): 본문으로 주고받고 자동 로그인이면 보안 저장소, 아니면 메모리. 앱 시작 때 `setRefreshTokenStore`로 끼운다.
  - 어떤 토큰도 localStorage·sessionStorage·URL에 두지 않는다(`session.test.ts`가 검사한다).
- 자동 로그인: 앱 시작 때 `restoreSession` → `restored`(로그인 화면 없이, 권한은 새 /me) / `none`(로그인 화면, 안내 없음) / `unavailable`(토큰 유지, 다시 시도). 웹은 여러 탭이 같은 쿠키를 쓰므로 리프레시를 Web Locks로 탭 사이 한 번에 하나만 보낸다(동시에 보내면 하나만 교체되고 나머지는 이전 토큰을 내민 것이 된다. 서버는 교체 직후 30초 유예 안이면 같은 새 토큰을 다시 주지만, 그 밖에서는 재사용으로 보고 세션을 폐기한다).
- 명령 전송:
  - 요청마다 새 `Idempotency-Key`(UUID). 같은 버튼 재시도는 같은 키를 재사용한다.
  - 202 `accepted`는 완료가 아니다. 결과는 WebSocket `command.result`로 받고, 일정 시간 안에 못 받으면 `GET /commands/{id}`로 조회한다.
  - 위험도 높은 명령(`set_mode`, `pick_from`, `update_setting`)은 `confirm: true` 없이 보내지 않는다. 재인증(비밀번호·PIN) 방식은 서버와 확정 전이므로 끼워 넣을 자리만 둔다.
- 화면은 이 함수들을 store의 thunk나 작은 훅(`useDeviceHistory` 등)을 통해 쓴다. 이력 그래프처럼 화면에서만 쓰는 조회 결과는 store에 넣지 않아도 된다.
