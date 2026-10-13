# mock-server/ — 개발용 모의 서버

실제 서버가 준비되기 전, `docs/dashboard-spec.md`의 API를 **그대로 흉내 내는** Node 서버다.
앱은 이 서버와 실서버를 주소만 바꿔 오갈 수 있어야 한다. 운영용이 아니다.

## 예정 구조

```
mock-server/
├── package.json
└── src/
    ├── index.ts          Express + ws 시작, --scenario 인자 처리
    ├── auth.ts           로그인·리프레시(사용할 때마다 교체)·로그아웃·ws-ticket(30초, 1회용)·/me
    ├── routes/           /plant, /devices, /robots, /alarms, /cameras, /commands, /push
    ├── stream.ts         WebSocket: 티켓 검증, 구독 관리, heartbeat 5초
    ├── sim/
    │   ├── plant.ts      탱크 적재·수분 변화, 압축기 압력·온도
    │   ├── robot.ts      집기→이동→놓기 사이클, 관절 값 15Hz(seq, ts 포함)
    │   └── commands.ts   명령 접수(202) → 지연 후 command.result
    ├── scenarios/        normal, tank-alarm, disconnect, robot-error, token-expiry, slow-network
    └── fixtures/         테스트 계정, 로봇 모델(범용 6축), 카메라 목록
```

## 규칙

- 타입은 전부 `@ecocycle/shared`에서 가져온다. 여기서 응답 형식을 새로 정의하지 않는다.
- **실서버처럼 엄격하게 동작한다.** 권한 없는 명령은 403, 로봇 오류 중 명령은 409, 잘못된 값은 422, `Idempotency-Key` 없으면 422, 같은 키 재전송은 첫 결과를 그대로 반환. 앱의 오류 처리를 검증하는 것이 이 서버의 목적이다.
- 테스트 계정은 역할별로 하나씩: `admin` / `operator` / `viewer` (비밀번호는 fixtures에, 실제 비밀번호처럼 보이지 않게).
- `robot.joints`는 구독한 연결에만 보낸다. 다른 메시지는 변할 때 + 최소 5초마다.
- 시나리오로 재현할 것: 적재율 80% 초과 알람, 15초 이상 무응답(연결 끊김), 로봇 `error`, 액세스 토큰 만료(401 → 리프레시), 느린 네트워크.
- 시각은 항상 UTC ISO 문자열, 단위는 명세 그대로.
- 서버 쪽 "진짜" 기능(FCM 발송, RTSP 변환, 실제 보안)은 흉내만 낸다. CCTV는 고정 샘플 영상이나 정지 이미지로 대체한다.
- 명세에 없는 엔드포인트를 앱 편의를 위해 추가하지 않는다. 필요하면 명세 수정안부터 제안한다.
