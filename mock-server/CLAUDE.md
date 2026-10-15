# mock-server/ — 개발용 모의 서버

실제 서버가 준비되기 전, `docs/dashboard-spec.md`의 API를 **그대로 흉내 내는** Node 서버다.
앱은 이 서버와 실서버를 주소만 바꿔 오갈 수 있어야 한다. 운영용이 아니다.

## 구조

```
mock-server/
├── package.json          dev(감시 실행), start(Render 등 배포 실행), typecheck
└── src/
    ├── index.ts          Express + WebSocket 서버 시작, 시뮬레이터·시나리오 시작
    ├── config.ts         포트, CORS_ORIGINS(쿠키 때문에 명시한 출처만, 비면 localhost:5173), REFRESH_COOKIE_SAMESITE(lax|none), --scenario 인자, 토큰 유효 시간
    ├── auth.ts           로그인(시도 제한 429, remember·refreshTokenDelivery), 세션(로그인 한 번의 토큰 묶음), 리프레시(쿠키 또는 본문, 사용할 때마다 교체,
    │                     재사용 감지 → 세션 폐기, 단 교체 직후 30초 안의 바로 앞 토큰은 같은 새 쌍을 다시 줌: REFRESH_REUSE_GRACE_SEC), 로그아웃(세션 폐기·쿠키 삭제), ws-ticket(30초, 1회용), /me, requireAuth
    ├── errors.ts         {"error":{"code","message"}} 응답
    ├── stream.ts         WebSocket: 티켓 검증, 구독 관리, heartbeat 5초, 시나리오 침묵·지연 반영
    ├── routes/           devices(요약·기기·이력·섹터 하역 기록), process(공정 흐름 상태·요약 이력·차량·배치 기록과 한 건 조회), robots(모델), alarms, cameras, commands(202·멱등성·403/409/422),
    │                     records(모든 `.../records`가 쓰는 페이지 나누기 `sendRecordPage`: 쿼리 검사 422, 구간 거르기, 최신 먼저, { items, total, page, pageSize })
    ├── sim/              state(현재 값), plant(탱크·컨베이어(벨트 위 덩어리 `itemsToBaler`)·압축기(사이클 단계 `cycleStage`)·알람), robot(사이클·관절 15Hz), commands(접수→결과),
    │                     picks(집기 기록, 한 번에 집는 부피 `pickVolumeM3`: 0.06~0.14 m³, 적재율·등급·잡음),
    │                     process(차량·배치·베일: 회사·배정 섹터·배합비·목표 압력을 예시로 정함, 로봇이 집을 섹터도 여기서),
    │                     unloads(섹터 하역 기록: 출차 때 한 줄, 시작할 때 지난 30일치, 계중대 무게 weighTruck),
    │                     records(공정 기록: 끝난 차량·배치 보관, 시작할 때 지난 30일치 배치에 건너뜀 약 7%·일시정지됨 약 5%를 섞음. 진행 중인 것은 process가 `live...Records()`로 내줌),
    │                     alarmOps, publish(변할 때·5초마다), history(가짜 이력), bus(sim → stream)
    ├── scenarios/        index(시나리오 9종), gate(침묵·지연 스위치)
    └── fixtures/         accounts(역할별 계정·권한 표), robotModel(범용 6축), cameras, settings(설정 키·범위),
                      process(가상의 회사·차량(번호판·등록 공차·싣는 양)·배정 섹터, 배합비·압력 범위, 단계별 시간, 하역 기록 채우기 규칙)
```

시나리오: `normal`, `tank-alarm`, `disconnect`, `robot-error`, `token-expiry`, `slow-network`, `refresh-expiry`(리프레시 토큰 30초), `refresh-reuse`(교체 뒤 유예 30초 + 5초에 이전 토큰을 다시 써 세션 폐기), `server-restart`(45초 뒤·2분마다 모든 세션 삭제와 WebSocket 닫기) (`npm run mock -- --scenario=이름`).
이 서버 자체의 단위 테스트는 없다. 동작은 `app`의 통합 테스트(`npm run test:integration`: 연결 끊김, 권한 403, 자동 로그인 쿠키·교체·재사용 감지·유예·로그아웃)와 `app` 화면 테스트가 확인한다.

## 규칙

- 타입은 전부 `@ecocycle/shared`에서 가져온다. 여기서 응답 형식을 새로 정의하지 않는다.
- **실서버처럼 엄격하게 동작한다.** 권한 없는 명령은 403, 로봇 오류 중 명령은 409, 잘못된 값은 422, `Idempotency-Key` 없으면 422, 같은 키 재전송은 첫 결과를 그대로 반환. 앱의 오류 처리를 검증하는 것이 이 서버의 목적이다.
- 테스트 계정은 역할별로 하나씩: `admin` / `operator` / `viewer` (비밀번호는 fixtures에, 실제 비밀번호처럼 보이지 않게).
- `robot.joints`는 구독한 연결에만 보낸다. 다른 메시지는 변할 때 + 최소 5초마다.
- 시나리오로 재현할 것: 적재율 80% 초과 알람, 15초 이상 무응답(연결 끊김), 로봇 `error`, 액세스 토큰 만료(401 → 리프레시), 느린 네트워크, 리프레시 토큰 만료·재사용, 서버 재시작(모든 세션 잃음).
- 세션은 메모리에만 둔다. 서버를 다시 켜면 모두 로그아웃된다(실제로도 그렇게 동작해 앱이 로그인 화면으로 돌아가는지 확인한다).
- 공정 흐름은 모든 시나리오에서 함께 돈다. 탱크 적재율은 차량이 내릴 때 늘고 로봇이 집을 때 준다. 회사·번호판은 가상의 것만 쓴다.
- 시각은 항상 UTC ISO 문자열, 단위는 명세 그대로.
- 서버 쪽 "진짜" 기능(FCM 발송, RTSP 변환, 실제 보안)은 흉내만 낸다. CCTV는 고정 샘플 영상이나 정지 이미지로 대체한다.
- 기록 엔드포인트(`.../records`)는 `sendRecordPage`로 응답한다. 기록은 sim이 실제처럼 쌓은 예시 값이고(가상의 회사·번호판), 앱은 "예시 데이터" 표시를 유지한다.
- 명세에 없는 엔드포인트를 앱 편의를 위해 추가하지 않는다. 필요하면 명세 수정안부터 제안한다.
