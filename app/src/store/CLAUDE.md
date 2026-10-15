# app/src/store — 앱 상태 (Redux Toolkit)

화면들이 함께 보는 **저빈도** 상태만 둔다. 로봇 관절 값은 여기 두지 않는다(`realtime/jointBuffer`).

## 파일과 슬라이스

```
store/
├── index.ts            createAppStore(), store, RootState, 로그아웃·세션 만료 시 전체 초기화
├── slices/             auth, plant, process, devices, alarms, connection, commands, ui
├── selectors.ts        selectCan, selectCanCommand, selectIsDisconnected, selectOpenAlarms, selectTanks …
├── hooks.ts            useAppDispatch, useAppSelector
├── realtimeSink.ts     realtime → store 연결, resync(REST로 요약·기기·열린 알람·공정 흐름 재동기화)
├── realtimeClient.ts   앱 전체에 하나뿐인 실시간 연결, 관절 값 구독 요청(acquireJoints), getJointBuffer
├── useRealtime.ts      useRealtime(앱 최상단), useRobotJointsSubscription(3D 홈·로봇 페이지)
├── useQualityTier.ts   앱 최상단: 화질 단계를 html의 data-quality에 적고, 고른 적이 없으면 qualityProbe로 재서 자동 선택
├── qualityProbe.ts     짧은 프레임 측정(3D 라이브러리 없이 작은 캔버스로)
└── bootstrap.ts        initApp: 세션 상실 핸들러 연결, 저장된 세션 복원
```

| 슬라이스 | 내용 |
| --- | --- |
| `auth` | 로그인 여부, `me`(id, name, role, permissions), 앱 시작 때 세션 확인(`restoreUserSession`: 되살아나면 새 /me, 서버에 닿지 못하면 `restoreUnavailable`로 다시 시도·`restoreSkipped`) |
| `plant` | 요약(평균 수분, 전체 적재율, 오늘 처리량, 압축기 가동률, 시스템 상태) |
| `process` | 공정 흐름: 차량·배치·베일의 최신 상태(종류별 최근 20건, 오래된 것부터). 단계·배정·배합·압력은 서버 값 그대로 |
| `devices` | 기기 ID별 최신 상태(`DeviceState`), `updatedAt` |
| `alarms` | 활성 알람 목록, 확인 처리 상태 |
| `connection` | `online / connecting / offline`, 마지막 수신 시각 |
| `commands` | 보낸 명령(Idempotency-Key로 구분), 상태(sending/accepted/rejected/completed/failed/unknown), 이유, HTTP 오류 코드 — 홈에서도 결과 표시. `sendDeviceCommand`가 WebSocket 결과를 기다리다 5초 뒤부터 조회한다 |
| `ui` | 선택된 기기(확대 대상), CCTV 열림 여부, 화질 단계(`qualityMode`)와 자동 선택 여부(`qualityAuto`), 사용자가 직접 골랐는지(`qualityChosen`, 3D 홈이 씀), 홈 모드(`homeMode`: 3d · dashboard, 기본 3d. `ecocycle.homeMode`에 기억하고 옛 키 `homeTab`·`homeView`는 처음 읽을 때 옮긴 뒤 지운다) |

## 규칙

- 모든 상태 타입은 `@ecocycle/shared` 타입을 그대로 쓴다. 서버 값을 가공한 복사본을 만들지 않는다.
- **권한 판단은 선택자 하나로:** `selectCan(permission)`. 화면에서 `role === 'admin'` 같은 비교를 하지 않는다(권한 종류가 아직 확정 전이다).
- 기기 상태가 오래됐는지(연결 끊김) 판단은 `connection` 슬라이스 + 선택자에서 한다. 컴포넌트마다 시간 계산을 하지 않는다.
- `status` 판정 로직을 여기 만들지 않는다. 서버가 보낸 `status`를 그대로 쓴다.
- 비동기 요청은 `createAsyncThunk`로 통일한다 (`docs/decisions.md`에 기록).
- `devices`·`plant`·`process`는 `updatedAt`이 더 오래된 값으로 덮어쓰지 않는다 (늦게 도착한 REST 응답 보호).
- 로그아웃 시 모든 슬라이스를 초기화한다.
- 3D 장면은 `useSelector`로 필요한 값만 고르고, 매 프레임 바뀌는 값은 구독하지 않는다.
