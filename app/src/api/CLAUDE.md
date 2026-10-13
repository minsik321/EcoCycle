# app/src/api — REST 클라이언트, 인증, 명령

서버와의 REST 통신을 한곳에 모은다. 화면 코드는 `fetch`를 직접 부르지 않고 이 폴더의 함수·훅만 쓴다.

## 예정 파일

```
api/
├── http.ts         기본 요청 함수: 기본 주소, Bearer 헤더, JSON, 오류 형식 변환, 401 처리
├── tokens.ts       액세스 토큰(메모리), 리프레시 토큰(보안 저장소) 보관
├── auth.ts         login, refresh, logout, getMe, getWsTicket
├── devices.ts      getPlantSummary, getDevices, getDeviceState, getHistory, getRobotModel
├── alarms.ts       getAlarms
├── cameras.ts      getCameras, getStreamUrl, getSnapshotUrl
├── push.ts         registerPush, unregisterPush
└── commands.ts     sendCommand(Idempotency-Key 생성), getCommand
```

## 규칙

- 기본 주소는 `config/env.ts`의 `API_BASE`(`https://{server}/api/v1`). 모의 서버와 실서버는 주소만 다르다.
- 요청·응답 타입은 `@ecocycle/shared`에서 가져온다. 여기서 응답 모양을 따로 정의하지 않는다.
- 상태 코드 처리(명세 6.1):
  - 401 → 리프레시로 재발급 후 원래 요청 1회 재시도. 동시에 여러 요청이 401이면 **리프레시는 한 번만** 실행하고 나머지는 기다린다. 리프레시도 실패하면 로그아웃 → 로그인 화면.
  - 리프레시 토큰은 사용할 때마다 교체되므로 응답의 새 토큰으로 즉시 바꾼다.
  - 403 조작 거부 / 409 이유 표시 / 422 입력 오류 / 429 잠시 대기 후 재시도 / 503 연결 끊김 표시.
  - 오류는 `{ code, message, status }` 형태의 `ApiError`로 통일해 던진다.
- 토큰 보관: 액세스 토큰은 메모리에만. 리프레시 토큰은 Capacitor 보안 저장소(웹 개발 중에는 대체 구현). localStorage·URL에 두지 않는다. (보관 방식은 서버 담당과 확인 필요)
- 명령 전송:
  - 요청마다 새 `Idempotency-Key`(UUID). 같은 버튼 재시도는 같은 키를 재사용한다.
  - 202 `accepted`는 완료가 아니다. 결과는 WebSocket `command.result`로 받고, 일정 시간 안에 못 받으면 `GET /commands/{id}`로 조회한다.
  - 위험도 높은 명령(`set_mode`, `pick_from`, `update_setting`)은 `confirm: true` 없이 보내지 않는다. 재인증(비밀번호·PIN) 방식은 서버와 확정 전이므로 끼워 넣을 자리만 둔다.
- 화면은 이 함수들을 store의 thunk나 작은 훅(`useDeviceHistory` 등)을 통해 쓴다. 이력 그래프처럼 화면에서만 쓰는 조회 결과는 store에 넣지 않아도 된다.
