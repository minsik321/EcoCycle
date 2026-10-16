# app/src/components — 공용 UI와 재사용 조작 컴포넌트

두 곳 이상에서 쓰는 UI만 둔다. 한 화면에서만 쓰면 그 화면의 `features/<화면>/` 안에 둔다.

## 구성

```
components/
├── common/        Button(48px, 처리 중 비활성), Card, Dialog(초점 가두기·Esc·초점 복귀), GlassPanel(유리 패널: main/minor),
│                  KpiCard + Sparkline(지표 카드와 작은 추이선), Tabs, DataTable, ToastCard(알림 카드 한 장)
├── status/        StatusBadge(색+기호+글자), OfflineNotice, Timestamp, useDisplayStatus(끊기면 모든 상태를 "연결 끊김"으로), tone(색 클래스)
├── controls/      DeviceControls, RobotModeControl(로봇 운전 모드 세 칸 + 섹터 칩·집기), CommandButton, ConfirmDialog, SettingForm(update_setting), AckAlarmButton, CommandResultToast, useDeviceCommand
├── layout/        Sidebar(앱의 유일한 주 메뉴: 폰 아래 탭 바 + "더 보기", md 이상 왼쪽 사이드바·접힘, 강조 `NAV_ACTIVE`), TopBar(앱의 유일한 상단 바, 아래 "상단 바" 절),
│                  AppShell(슬롯: headerCenter·headerExtra·overlays, 간격 `SHELL_GAP_X`·`SHELL_GAP_TOP`), sidebarPref(사이드바 접힘, 기기에 기억), TopCards,
│                  shellChrome(`useImmersiveShell`: 화면이 있는 동안 틀의 상단 바·끊김 안내·내용 여백을 거두고 headerExtra를 넘긴다. 3D 홈만 쓴다.
│                  `useHeaderSlot`: 틀의 상단 바 가운데 칸, 화면이 포털로 홈 전환을 넣는다)
├── charts/        HistoryChart(받은 점만 그리는 표시 전용), ticks(날짜 눈금)
├── records/       RecordList(기간 고르기 → 서버에서 10줄씩 → 폰 쌓인 줄 / md 이상 표 → 쪽 넘기기), Pagination, range(기간·쪽 번호 계산),
│                  recordPopup(기록 상세 팝업의 주소·기록 상태, `PopupLink`·`useOpenRecordPopup`: 그리기는 features/records/popup)
└── device/        기기 페이지 틀: DevicePage(배치: `illustrated`면 위쪽 두 칸, 아니면 한 줄), DeviceHero(이름·큰 상태 칩·지금 하는 일·선택 그림), KeyTile/KeyTiles(최대 4개, 작은 추이선·게이지, `wide`면 폭 전체 격자),
                   NowNext(지금/다음), ActionBar·DeviceActionBar(위험도 낮은 조작 + 알람 확인), DetailsSection("자세히", 처음엔 닫힘), live(연결 상태)
```

## 상단 바 (`layout/TopBar`, 2026-10-16 "상단 바 하나로")

- 앱에 상단 바는 하나이고 어디서나 떠 있는 둥근 판이다(2026-10-16 "떠 있는 상단 바"): 화면 가장자리에서 폰 8px·그 밖 10px, 높이 56px, `rounded-panel`, `shadow-soft-2`. 일반 화면은 `AppShell`이 흰 단색 판으로 그리고(`data-topbar="page"`), 3D 홈은 틀의 바를 넘겨받아 같은 컴포넌트를 `overlay` 모양(성에 낀 유리, `data-topbar="overlay"`)으로 3D 위에 그린다. 화면 내용은 바 아래 같은 간격에서 시작하고 좌우 끝이 바와 맞는다(`SHELL_GAP_X`·`SHELL_GAP_TOP`, 3D 홈 패널의 `--st-gap`과 같은 값). 화면이 따로 상단 바를 만들지 않는다.
- 순서: 로고 · "예시 데이터"(값이 모의 서버에서 올 때) · 가운데 칸(홈에서만 3D | 대시보드 전환. 대시보드는 `useHeaderSlot` 포털, 3D 홈은 `center`) · 연결·시계 알약(연결되면 지금 시각, 끊기면 "연결 끊김"과 마지막 수신 시각) · 알람 · CCTV(`extra`) · 사용자 메뉴(이름·권한, 설정(화질), 로그아웃).
- 폰(md 미만): 알람은 아래 탭 바의 "알람" 배지가 맡아 바에서 빼고 CCTV는 사용자 메뉴 안. 로고 글자는 전환이 있으면 xl 미만에서 뺀다(사이드바를 펼친 태블릿에서도 전환이 잘리지 않게). 사용자 이름은 xl부터.
- 서버 없는 시연 화면은 `live`(연결 상태)와 `example`을 직접 넘긴다. 높이는 56px(`h-14`): 3D 홈 패널 자리(`studio.css`)가 이 높이를 기준으로 한다.
- 점검: `node app/scripts/topBar.mjs`(세 크기, 결과 `docs/screenshots/top-bar`), `node app/scripts/floatingBar.mjs`(3D 홈·대시보드·공정 기록에서 바 자리·모양·사이드바 폭이 같은지, 나란히 놓은 비교 `docs/screenshots/floating-bar`).

## 주 메뉴 (`layout/Sidebar`)

- 앱에 메뉴는 하나다. `AppShell`이 모든 로그인 화면(3D 홈 포함)에 그리고, 화면이나 스튜디오는 메뉴를 따로 만들지 않는다.
- 같은 `<nav aria-label="주 메뉴">`가 CSS로 모양만 바꾼다: md 미만은 아래 탭 바(`phoneTab` 메뉴 + "더 보기"가 나머지를 위로 펼침), md 이상은 왼쪽 사이드바.
- 사이드바는 접을 수 있다(아이콘만, 이름은 화면 읽기용으로 남음). 폭은 어느 화면에서나(3D 홈 포함) 같다: 접힘 여부는 앱 틀의 값 하나(`layout/sidebarPref.ts`, `ecocycle.sidebar`)이고, 고른 적이 없으면 태블릿(xl 미만) 아이콘만·데스크톱(xl 이상) 펼침, 누르면 기기에 기억한다. 접기 단추는 늘 메뉴 맨 위 같은 모양. 펼친 메뉴는 3D 위에 뜨지 않고 자리를 차지한다. 내용 영역은 `isolate`라 3D 패널이 메뉴 위로 올라오지 않는다.
- 지금 화면의 메뉴 강조는 `NAV_ACTIVE` 하나(펼침·접힘·탭·"더 보기" 모두). "더 보기" 안의 화면을 보고 있으면 "더 보기" 버튼이 켜진다.

## 기록 목록 (`records/`)

- `RecordList<T>`는 `load(query, signal)`, `rowKey`, `time`, 폰 줄의 `title`·`detail`, 표의 `columns`를 받는다("시각" 칸은 저절로 맨 앞). API는 `load`로만 부른다.
- 기간은 현지 날짜로 고르고 `[from, to)`를 UTC ISO로 보낸다. 직접 선택은 끝날을 포함하고(다음 날 0시까지) "적용"을 눌러야 요청한다. 기간을 바꾸면 1쪽으로.
- 처음은 "불러오는 중…", 이후는 이전 목록을 흐리게 두고 받는다. 실패하면 오류와 "다시 시도". 비면 "이 기간에 기록이 없습니다"(쪽 넘기기 없음).
- 폰은 기간 버튼 2×2(글자 130%에서도 한 줄), 쪽 번호는 지금 쪽 앞뒤 3개, md 이상은 한 줄·5개.
- 선택: `timeHeader`(시각 칸 머리글), `extra`(폰 줄의 둘째 설명 줄), `dense`(표 칸 여백을 줄여 칸이 많은 목록이 820px에 들어가게), `onOpen`(줄을 누르면 부름: 폰 줄은 버튼, 표 줄은 `DataTable.onRowClick`). 공정 기록이 쓴다.
- 미리 보기: `/design/records`(예시 값, `?empty=1`, `?offline=1`).
- 짧은 기록은 `compactTime`으로 오늘의 시각을 시:분만 표시한다. 로봇 집기 기록이 사용한다.

## 기기 페이지 틀 (`device/`)

- 모든 기기 페이지는 `DevicePage`에 다섯 조각(hero, tiles, now, actions, details)을 끼워 만든다. 지난 기록이 있으면 여섯째 `records`(폭 전체, 폰에서는 조작 줄 앞). 폰은 한 줄(조작 줄은 주 메뉴 바로 위에 붙음). `md` 이상: 그림이 있는 페이지(`illustrated`, 섹터만)는 위쪽을 두 칸(왼쪽 그림·조작, 오른쪽 수치·지금/다음)으로, 그림이 없는 페이지(로봇팔·압축기·컨베이어)는 한 줄로 머리 → 주요 수치(`KeyTiles wide`) → 지금/다음 → 조작 → 자세히 → 기록. 정보를 더하지 않는 장식 그림은 두지 않는다.
- "자세히"(`DetailsSection`)는 어느 기기든 위쪽 영역 밖에 폭 전체로 놓이고(오른쪽 칸 안에 넣지 않는다), 열면 `md` 이상에서 왼쪽 넓은 칸(`children`: 이력 그래프·진단 표)과 오른쪽 칸(`side`: 설정·알람 이력)으로 펼친다. 한쪽만 있으면 `side`끼리 두 칸으로 나눈다.
- 연결 끊김 처리는 조각들이 `useDeviceLive()`로 직접 한다: 값·하는 일·지금/다음은 "–", 상태 칩은 "연결 끊김", 마지막 수신 시각 표시, 그림 영역은 `data-frozen="true"`(CSS 움직임 정지, `styles/index.css`). 캔버스 그림은 `useDeviceLive().disconnected`를 보고 스스로 멈춘다.
- `DeviceLiveOverride`는 서버 없이 보는 미리 보기(`/design/device`)에서만 쓴다.
- 조작 줄에는 위험도 낮은 조작만 둔다. 설정 변경은 "자세히" 안에서 확인 단계를 거친다. 로봇 운전 모드(모드 전환·수동 집기)는 로봇팔 페이지의 핵심 조작이라 "자세히" 밖, 지금/다음 아래의 카드(`RobotModeControl`)에 두고 같은 확인 단계를 거친다.
- `KeyTile`의 `kind: 'text'`는 글로 된 값(모드·현재 작업·단계)을 숫자보다 작게 적고 넘치면 말줄임한다. `sub`(예: "/ 28.5")는 폰에서는 값 옆, 태블릿의 좁은 반 칸에서는 값 아래 줄.
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

- `DeviceControls`는 `deviceId`와 `context: 'home' | 'page'`를 받는다. 버튼 하나로 보내는 명령만 그린다.
  - `home`: 위험도 낮음 명령만(`start`, `pause`, `resume`, `stop`, `ack_alarm`).
  - `page`: 기기 페이지에 둘 수 있는 명령 중 값을 고를 필요가 없는 것. 값을 고르는 위험 조작은 각자 컴포넌트가 맡는다: `update_setting`은 `SettingForm`, `set_mode`·`pick_from`은 `RobotModeControl`. 위험도 높음 명령은 반드시 `ConfirmDialog`를 거쳐 `confirm: true`로 보낸다.
- `RobotModeControl`: 세 칸(`role="radiogroup"`, 좌우 화살표)을 고르는 것은 초안이고 서버 모드에는 "지금"이 붙는다. 자동 · 섹터 지정은 섹터 칩(여러 개, 적용된 칩 표시)과 "적용" 하나, 수동은 "집을 섹터" 선택과 "집기"가 한 줄(지금 수동이 아니면 먼저 "적용"). 머리에 마지막 모드 전환 결과(적용 대기 → 적용됨·거부됨, 시각). 서버 모드·지정 섹터가 바뀌면 초안을 서버 값으로 되돌린다. 로봇 조작 권한이 하나도 없으면 그리지 않는다.
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
- `KpiHistoryChart`는 KPI 서버 응답의 구간별 막대·수분 선/목표 밴드·가동/정지 막대를 그리는 표시 전용이다(`/design`에서 세 종류 미리 보기). `Dialog size="sheet"`는 폰 하단 시트·큰 화면 중앙 대화상자이며(`popup`·`popupNarrow`는 기록 상세 팝업: 폰은 화면 높이 전체까지, `closeLabel`을 주면 제목 줄에 닫기 버튼), KPI 카드의 선택적 `onClick`은 접근 가능한 전체 카드 버튼을 제공한다.
