# shared/ — API 계약 타입

`docs/dashboard-spec.md` 6절(API 명세)을 TypeScript 타입으로 옮긴 곳이다. `app`과 `mock-server`가 둘 다 여기서 import한다.
이 폴더가 곧 "프론트가 이해한 서버 계약"이다.

## 예정 파일

```
shared/
├── package.json        name: @ecocycle/shared
└── src/
    ├── index.ts        재수출
    ├── ids.ts          DeviceId, RobotId, CameraId 리터럴 유니온
    ├── auth.ts         LoginRequest/Response, Me, Role, Permission
    ├── devices.ts      TankState, RobotState, ConveyorState, CompressorState, DeviceState(type으로 구분), PlantSummary
    ├── robot.ts        RobotModel(축 수, 관절 순서, 링크 길이, 각도 범위, 영점), Phase
    ├── ws.ts           ClientMessage(subscribe/unsubscribe), ServerMessage(plant.summary, device.state, robot.joints, alarm, command.result, heartbeat), Topic
    ├── commands.ts     Command(type으로 구분된 유니온), CommandStatus, CommandRisk 표
    ├── alarms.ts       Alarm, AlarmLevel
    ├── cameras.ts      Camera, StreamInfo
    └── errors.ts       ApiErrorCode, 오류 응답 형식
```

## 규칙

- **명세가 먼저다.** 필드 이름·값 목록은 명세의 JSON 예시와 표를 그대로 따른다(`fillPercent`, `volumeM3`, `capacityM3`, `moisturePercent`, `pressureMpa`, `temperatureC` …). 이름을 "더 좋게" 바꾸지 않는다.
- 상태 값은 문자열 리터럴 유니온으로: `status` = `normal | caution | alarm | offline`, 로봇 `status` = `idle | running | paused | stopped | error | offline`, `phase` = `idle | pick | move | place`.
- 여러 형태가 있는 메시지는 `type` 필드로 구분되는 유니온으로 만들어 `switch`에서 빠진 경우가 컴파일 오류가 나게 한다.
- 시각은 `string`(ISO 8601 UTC)로 둔다. `Date`로 바꾸는 것은 앱의 표시 계층에서만.
- 무게 필드는 만들지 않는다.
- 런타임 코드는 최소한으로: 타입, 상수(기기 ID 목록, 명령별 위험도·필요 권한 표), 순수 함수만. React·Node 전용 import 금지.
- 명령별 위험도와 필요 권한 표(`commands.ts`)는 화면 분기와 모의 서버 검증이 함께 쓰므로 여기 한 곳에만 둔다.
- 타입을 바꾸면 `npm run typecheck`로 app과 mock-server 양쪽 오류를 확인하고 함께 고친다.
