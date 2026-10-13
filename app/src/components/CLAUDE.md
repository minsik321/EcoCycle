# app/src/components — 공용 UI와 재사용 조작 컴포넌트

두 곳 이상에서 쓰는 UI만 둔다. 한 화면에서만 쓰면 그 화면의 `features/<화면>/` 안에 둔다.

## 예정 구성

```
components/
├── status/        StatusBadge(normal/caution/alarm/offline), OfflineNotice(“연결 끊김 · 마지막 수신 HH:MM:SS”), Timestamp
├── controls/      DeviceControls, CommandButton, ConfirmDialog, CommandResultToast
├── layout/        Sidebar, AppShell, TopCards 틀
├── charts/        TrendSparkline(확대 화면 짧은 추이), HistoryChart(기기 페이지 이력)
└── common/        Button, Card, Dialog, Spinner 등 기본 요소
```

## 조작 컴포넌트 규칙 (`controls/`)

명세: "같은 조작 컴포넌트를 홈과 기기 페이지 두 곳에서 재사용".

- `DeviceControls`는 `deviceId`와 `context: 'home' | 'page'`를 받는다.
  - `home`: 위험도 낮음 명령만(`start`, `pause`, `resume`, `stop`, `ack_alarm`).
  - `page`: 전체 명령. 위험도 높음 명령은 반드시 `ConfirmDialog`를 거쳐 `confirm: true`로 보낸다.
- 명령별 위험도와 필요 권한은 `@ecocycle/shared`의 표에서 읽는다. 컴포넌트 안에 목록을 다시 쓰지 않는다.
- 권한이 없으면 숨기거나 비활성화(`selectCan`). 이는 표시일 뿐이고 차단은 서버가 한다.
- 연결 끊김 또는 기기 `offline`이면 조작 버튼을 비활성화하고 이유를 보여 준다.
- 누른 뒤에는 `accepted → completed / rejected / failed`를 `CommandResultToast`로 홈에서도 보이게 한다. 중복 클릭은 처리 중 비활성화로 막는다.
- "비상정지"처럼 보이는 버튼을 만들지 않는다. `stop`은 일반 정지이며 안전 장치가 아니다.

## 공통 규칙

- 상태 표시는 색 + 아이콘 + 글자를 함께. 색 토큰은 `config/display.ts`.
- 터치 대상 최소 48dp, 호버 의존 금지.
- 컴포넌트는 props와 선택자로만 데이터를 받는다. API를 직접 호출하지 않고, 명령은 `api/commands`를 쓰는 훅을 통해 보낸다.
- 차트는 가벼운 라이브러리 하나로 통일하고 홈 3D 장면과 같은 화면에서 무거운 애니메이션을 켜지 않는다.
