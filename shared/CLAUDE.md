# shared/ — API 계약 타입

`docs/dashboard-spec.md` 6절(API 명세)을 TypeScript 타입으로 옮긴 곳이다. `app`과 `mock-server`가 둘 다 여기서 import한다.
이 폴더가 곧 "프론트가 이해한 서버 계약"이다.

## 파일

```
shared/
├── package.json        name: @ecocycle/shared (소스를 그대로 내보낸다, 빌드 없음)
└── src/
    ├── index.ts        재수출
    ├── ids.ts          기기 ID 7개(상수 배열)와 DeviceId·TankId 등, deviceTypeOf
    ├── common.ts       IsoTimestamp, DeviceStatus, 단위 규칙(주석)
    ├── robot.ts        Phase, RobotStatus, RobotMode, RobotModel(제안안)
    ├── auth.ts         Role, Permission, Me, 로그인(remember·refreshTokenDelivery)·리프레시·로그아웃·ws-ticket 요청/응답,
    │                   리프레시 쿠키 이름·경로, 리프레시 거부 code(⚠ B28), PushRegisterRequest
    ├── devices.ts      TankState(등급 grade 포함)·RobotState·ConveyorState·CompressorState, DeviceState(type으로 구분), PlantSummary·HistoryResponse·PlantHistoryResponse(제안안)
    ├── records.ts      기록 목록 페이지 나누기: RecordQuery(from·to·page·pageSize), RecordPage<T>({ items, total, page, pageSize }), RECORD_PAGE_SIZE(10), recordPageCount (제안안)
    ├── processRecords.ts 공정 기록: VehicleRecord(상태 identified·unloading·departed, 입·출차 시각, 총중량·공차·순중량), BatchRecord(결과 completed·skipped·paused·null=진행 중, 목표·실제 압력, 베일 ID) (제안안)
    ├── process.ts      공정 흐름: Vehicle·Batch·Bale(stage와 stageTimes), ProcessState, PLANT_METRICS (제안안, 서버 합의 전)
    ├── alarms.ts       Alarm, AlarmLevel, AlarmState
    ├── cameras.ts      Camera, StreamInfo
    ├── commands.ts     Command(type으로 구분), COMMAND_RULES(위험도·필요 권한·대상·confirm), CommandStatus, 202·조회 응답
    ├── ws.ts           Topic, ClientMessage, ServerMessage(9종, process.* 포함)
    └── errors.ts       ApiErrorBody(code는 문자열), 클라이언트가 구분하는 상태 코드(404 포함)
```

명세에 JSON 예시가 없어 이름을 정한 곳은 코드 주석에 ⚠로 표시했고 서버 담당 질문(`docs/questions.md` B11~B17, 공정 흐름은 B23~B27)에 올려 두었다.

## 규칙

- **명세가 먼저다.** 필드 이름·값 목록은 명세의 JSON 예시와 표를 그대로 따른다(`fillPercent`, `volumeM3`, `capacityM3`, `moisturePercent`, `pressureMpa`, `temperatureC` …). 이름을 "더 좋게" 바꾸지 않는다.
- 상태 값은 문자열 리터럴 유니온으로: `status` = `normal | caution | alarm | offline`, 로봇 `status` = `idle | running | paused | stopped | error | offline`, `phase` = `idle | pick | move | place`.
- 여러 형태가 있는 메시지는 `type` 필드로 구분되는 유니온으로 만들어 `switch`에서 빠진 경우가 컴파일 오류가 나게 한다.
- 시각은 `string`(ISO 8601 UTC)로 둔다. `Date`로 바꾸는 것은 앱의 표시 계층에서만.
- 무게 필드는 차량·하역 기록에만 둔다(`grossT`, `tareT`, `netT`, t). 기기 상태·실시간 메시지에는 만들지 않는다(명세 6절 "공통 규칙").
- 기록 목록은 모두 `records.ts`의 `RecordQuery`·`RecordPage<T>`를 쓴다. 기록마다 페이지 모양을 새로 만들지 않는다.
- 런타임 코드는 최소한으로: 타입, 상수(기기 ID 목록, 명령별 위험도·필요 권한 표), 순수 함수만. React·Node 전용 import 금지.
- 명령별 위험도와 필요 권한 표(`commands.ts`)는 화면 분기와 모의 서버 검증이 함께 쓰므로 여기 한 곳에만 둔다.
- 타입을 바꾸면 `npm run typecheck`로 app과 mock-server 양쪽 오류를 확인하고 함께 고친다.
