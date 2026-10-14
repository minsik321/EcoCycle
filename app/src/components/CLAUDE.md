# app/src/components — 공용 UI와 재사용 조작 컴포넌트

두 곳 이상에서 쓰는 UI만 둔다. 한 화면에서만 쓰면 그 화면의 `features/<화면>/` 안에 둔다.

## 구성

```
components/
├── common/        Button(48px, 처리 중 비활성), Card, Dialog(초점 가두기·Esc·초점 복귀), GlassPanel(유리 패널: main/minor),
│                  KpiCard + Sparkline(지표 카드와 작은 추이선), Tabs, DataTable, ToastCard(알림 카드 한 장)
├── status/        StatusBadge(색+기호+글자), OfflineNotice, Timestamp, useDisplayStatus(끊기면 모든 상태를 "연결 끊김"으로), tone(색 클래스)
├── controls/      DeviceControls, CommandButton, ConfirmDialog, SettingForm(update_setting), AckAlarmButton, CommandResultToast, useDeviceCommand
├── layout/        Sidebar, TopBar(로고·시계·알람 수·연결 상태·화질·사용자), AppShell(슬롯: headerCenter·headerExtra·overlays), TopCards,
│                  shellChrome(`useImmersiveShell`: 화면이 있는 동안 메뉴·상단 바·끊김 안내를 숨기고 headerExtra를 넘긴다. 3D 홈만 쓴다)
├── charts/        HistoryChart(받은 점만 그리는 표시 전용), ticks(날짜 눈금)
└── device/        기기 페이지 틀: DevicePage(배치), DeviceHero(이름·큰 상태 칩·지금 하는 일·그림), KeyTile/KeyTiles(최대 4개, 작은 추이선),
                   NowNext(지금/다음), ActionBar·DeviceActionBar(위험도 낮은 조작 + 알람 확인), DetailsSection("자세히", 처음엔 닫힘), live(연결 상태)
```

## 기기 페이지 틀 (`device/`)

- 모든 기기 페이지는 `DevicePage`에 다섯 조각(hero, tiles, now, actions, details)을 끼워 만든다. 폰은 한 줄(조작 줄은 주 메뉴 바로 위에 붙음), `md` 이상은 두 줄.
- 연결 끊김 처리는 조각들이 `useDeviceLive()`로 직접 한다: 값·하는 일·지금/다음은 "–", 상태 칩은 "연결 끊김", 마지막 수신 시각 표시, 그림 영역은 `data-frozen="true"`(CSS 움직임 정지, `styles/index.css`). 캔버스 그림은 `useDeviceLive().disconnected`를 보고 스스로 멈춘다.
- `DeviceLiveOverride`는 서버 없이 보는 미리 보기(`/design/device`)에서만 쓴다.
- 조작 줄에는 위험도 낮은 조작만 둔다. 위험 조작(모드 전환·탱크 지정 집기·설정 변경)은 "자세히" 안에서 확인 단계를 거친다.
- "자세히"의 내용은 열 때 처음 그린다(열기 전에는 이력 요청이 나가지 않는다).

## 디자인 시스템

- 색·모서리·그림자·글꼴 토큰은 `styles/index.css`의 `@theme` 한 곳에만 둔다. 화면 코드는 토큰 클래스(`bg-paper`, `bg-surface`, `text-ink`, `text-ink-soft`, `border-line`, `bg-accent`, `rounded-control`, `rounded-card`, `shadow-soft-1~3`)와 이 폴더의 컴포넌트를 쓰고, `slate-*` 같은 임의 색이나 직접 적은 그림자 값을 쓰지 않는다.
- 강조색은 파랑(`accent`) 하나다. 상태 색(`status-*`)은 뜻이 있는 색이라 꾸밈에 쓰지 않는다.
- 색 토큰 이름을 Tailwind의 글자 크기 이름(`base`, `sm`, `lg` …)과 겹치게 짓지 않는다. `text-base`가 글자 크기와 색을 함께 바꿔 버린다(바탕색 이름이 `paper`인 이유).
- 3D 화면 위에 띄우는 패널은 `GlassPanel`(또는 `Card glass`)을 쓴다. 유리 효과는 화질 단계에 따라 CSS가 켜고 끄며(`.glass` 주요 패널, `.glass-minor` 보조 패널), 저사양에서는 흰 단색 + 그림자로 보인다. 컴포넌트에서 `backdrop-blur`를 직접 쓰지 않는다.
- `.glass` 규칙은 CSS 컴포넌트 층에 있어서 유틸리티 클래스로 덮을 수 있다.
- 토큰과 컴포넌트는 `/design`(features/design, 개발용)에서 화질 단계별로 볼 수 있다. 컴포넌트를 추가·변경하면 그 화면에도 넣는다.

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

- 상태 표시는 색 + 아이콘 + 글자를 함께. 색 토큰은 `styles/index.css`, 문구·기호는 `config/display.ts`.
- 터치 대상 최소 48dp, 호버 의존 금지.
- 컴포넌트는 props와 선택자로만 데이터를 받는다. API를 직접 호출하지 않고, 명령은 `api/commands`를 쓰는 훅을 통해 보낸다.
- 차트는 Recharts로 통일한다. `HistoryChart`는 받은 점만 그리는 표시 전용이고, 구간 이동·요청은 `features`의 `useHistoryWindow`가 맡는다(규칙은 `features/CLAUDE.md`의 이력 그래프 절). 홈 3D 장면과 같은 화면에서는 차트 애니메이션을 끈다.
