# app/src/features — 화면 단위 기능

화면(라우트)마다 폴더 하나. 각 폴더는 `XxxPage.tsx`, 그 화면에서만 쓰는 컴포넌트와 훅을 가진다.

## 예정 구성과 라우트

| 폴더 | 라우트 | 내용 |
| --- | --- | --- |
| `auth/` | `/login` | 로그인, 로그아웃, 인증 필요 라우트 보호 |
| `home/` | `/` | 맨 위 전환 "3D | 대시보드": 3D 홈(`studio`) 또는 3D 없는 대시보드 |
| `tank/` | `/tanks`, `/tanks/:id` | 섹터(표시 이름, 코드·주소는 tank): 납작한 2D 칸 그림 목록, 상세(칸 그림 안에 적재율·부피 + 위 칩 수분·등급·상태, 지금/다음, 자세히, 하역 기록) |
| `robot/` | `/robot` | 기기 페이지 틀(그림 없음): 모드·현재 작업·이번 시간 집기·그리퍼, 운전 모드(세 칸), 자세히(진단·설정·오류 로그), 사이클 통계, 집기 기록 |
| `conveyor/` | `/conveyor` | 기기 페이지 틀(그림 없음): 가동·적재 정도·압축기로 가는 중, 자세히(이력·속도 설정·알람 이력) |
| `compressor/` | `/compressor` | 기기 페이지 틀(그림 없음): 압력 게이지 칸(지금 vs 목표)·온도·오늘 베일·사이클 단계, 지금 배치(배치·베일 링크), 자세히(이력·설정·알람·점검 이력) |
| `alarms/` | `/alarms` | 열린 알람 / 알람 이력(기간 탭 + 검색 상자, 서버가 거름), 확인 처리, 누르면 해당 기기 페이지로 |
| `records/` | `/records`, `/records/batches`, 팝업 주소 `/records/{vehicles,batches,bales}/:id` | 공정 기록: 탭 차량·배치·베일(`?tab=`, 모두 `RecordList`), 배치·베일 제어 화면, 차량·배치·베일 상세 팝업 |
| `settings/` | `/settings` | 화질 모드(고화질/기본/저사양, 자동으로 다시 고르기), 계정, 앱 정보 |
| `design/` | `/design` | 디자인 토큰과 공용 컴포넌트 미리 보기 (개발용, 로그인 불필요, 값은 모두 예시) |
| `cctv/` | 오버레이 | 카메라 선택, 발급받은 주소를 `<video>`로 재생 |

주 메뉴 순서: 홈, 섹터, 로봇팔, 컨베이어, 압축기, 알람, 공정 기록, 설정. 권한 없는 메뉴는 숨기거나 비활성화.
메뉴는 앱 전체(3D 홈 포함)에 하나뿐이다(`components/layout/Sidebar`, 앱 틀 `AppShell`이 그린다): 폰은 아래 탭 바(홈·섹터·로봇팔·알람 + "더 보기"), 태블릿·데스크톱은 왼쪽 사이드바(어느 화면에서나 같은 폭: 태블릿 기본 아이콘만, 데스크톱 기본 펼침, 접기·펼치기는 기기에 기억). 화면이 메뉴를 따로 만들지 않는다.

## 구현 상태 (1단계 완료, 2단계 3D 홈 구현)

위 표의 화면은 모두 2D로 구현했고, 2단계에서 홈에 3D 장면(`app/src/studio`)을 얹었다. 처음 만든 3D 장면(`scene/`, 홈의 "기본" 탭)은 2026-10-14에 삭제했다(`docs/decisions.md`).

- `home/HomePage.tsx`, `home/HomeSwitch.tsx`: 맨 위 전환 하나 "3D | 대시보드". 고른 쪽은 기기에 기억하고(`ui.homeMode`, `ecocycle.homeMode`, 고른 적이 없으면 폰은 대시보드·그 밖은 3D) 옛 키(`homeTab`·`homeView`)는 처음 읽을 때 옮긴다. 3D는 `app/src/studio`를 lazy로 불러와 홈 화면 전체를 쓰고(패널이 먼저, 3D 장면은 그 아래에 나중에), 전환은 앱 상단 바(`components/layout/TopBar`)의 가운데 칸에 들어간다(3D는 3D 위에 뜬 같은 바, 대시보드는 틀의 바에 `useHeaderSlot` 포털, 폰에서도 바로 보임). 그래픽(WebGL)을 못 쓰거나 3D에서 오류가 나면 기억한 값은 두고 대시보드로 보여 주며 짧게 알린다("3D"는 누를 수 없게).
- `home/useStudioPrefetch.ts`: 앱 틀(`App.tsx`)이 쓴다. 홈을 3D로 기억한 기기면 로그인 화면에서 한가할 때 3D 파일(정적 파일만)을 미리 받는다(`studio/preload.ts`). 로그인 전에는 API·WebSocket을 부르지 않는다.
- `home/dashboard/`: 대시보드 홈(`Dashboard.tsx`, 값 고르기 `dashboardData.ts`). three.js를 import하지 않는다. 공정 문구·6단계 계산은 3D 홈과 함께 쓰는 `config/processDisplay.ts`, 추이선은 `store/usePlantTrends.ts`. `features/home`은 `studio`를 정적으로 import하지 않는다(예외: three를 import하지 않는 `studio/three/stats`와 `studio/preload`).
- `home/SceneDemoPage.tsx`: 서버·로그인 없이 3D 홈만 보여 주는 시연·프레임 측정 화면(`/scene-demo`). 값은 예시이고 화면에 그렇게 표시한다. 이 주소를 열 때만 불러온다(lazy).
- 3D 홈의 모양·배치 규칙은 `app/src/studio/CLAUDE.md`. 아래 home/ 규칙은 대시보드의 규칙이다.
- 홈 주소에 `?demo=1`을 붙이면 서버 관절 값 대신 정해진 시연 동작을 보여 준다(명세의 최후 수단, "시연 동작" 표시).
- `tank/`: `SectorBin`(납작한 2D 사각 칸 그림 SVG: 아래에서 적재율만큼 차는 평평한 크라프트 채움 + 윗가장자리 짙은 선 + 은은한 파지 무늬, 서버 주의 기준선은 가는 점선과 "주의 N%" 글자, 값이 바뀌면 `transform` 전환, 섹터 목록(`size="sm"`)과 상세(`lg`)가 같은 컴포넌트). 적재율(큰 글자)과 부피 "4.8 / 8.0 m³"는 그림 안, 채움 윗선 바로 위 밝은 빈 곳에 붙고, 거의 차면 칸 위 여백까지 올라가 파지 무늬 위에 놓이지 않는다. 끊기면(`frozen`) 전환을 멈추고 "–"와 마지막 수신 시각. `SectorChips`(수분·등급 작은 칩, 상세는 머리 줄의 상태 칩 앞, 목록은 카드 아래), `TankListPage`(폰 2개씩, 카드: 이름·상태 → 칸 그림 → 칩), `TankPage`(`DevicePage` 틀, 따로 된 주요 수치 칸 없음(추이는 자세히의 이력 그래프), 태블릿·데스크톱은 그림 카드 하나 안에 그림과 그 아래 지금/다음, PC(xl, 1280px 이상)는 "자세히"를 그림 카드 오른쪽에 늘 펼친 채, 접기 버튼 없이(`DetailsSection pinnedWhen={WIDE_QUERY}`), 칸 폭은 그림 카드 1 : 자세히 2(`xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`, 자세히 안은 컨테이너 쿼리로 가로로 펼침), 두 칸은 같은 높이(낮은 쪽이 늘어나고 그림 카드는 그림 칸이 늘어남), 폰은 그림 카드 → 지금/다음(따로 된 카드) → 자세히 → 하역 기록, 맨 아래 `SectorUnloads` = `RecordList`로 `GET /devices/{id}/unloads/records`), `sectorText`(그림 설명, 지금/다음 문장). 화면 글은 "섹터", 코드·주소·ID는 tank 그대로.
- `records/`(4단위): `RecordsPage`(탭은 주소의 `?tab=vehicles|batches|bales`라 홈의 링크가 탭을 골라 열고 뒤로 가기에도 유지), `VehicleRecords`(입차·출차 시각, 번호판, 회사, 섹터, 총중량·공차·순중량 t, 상태 인식·하역·출차, `GET /vehicles/records`), `BatchRecords`(시작·종료, 배합 섹터 %, 평균 수분, 목표→실제 압력, 결과 완료·건너뜀·일시정지됨·진행 중, 만든 베일, `GET /batches/records`), `BaleRecords`(베일 ID, 생산 시각, 배치, 압력, 평균 수분, 상태 적치·출하, `GET /bales/records`). 줄을 누르면 상세 팝업(아래 "기록 상세 팝업"). 주소 만들기는 `config/navigation.ts`(`recordsPath`, `vehicleRecordPath`, `batchRecordPath`, `baleRecordPath`). 폰은 "더 보기" 안의 메뉴. 홈에서 오는 링크: 대시보드 "전체 보기"(지금 배치 카드 → 배치·베일 화면, 최근 차량·베일 카드 → 차량 탭)와 "이 배치 상세"·최근 차량·베일 줄(팝업), 3D 홈 "기록 보기"(차량·배치·베일 탭)·표에서 장면에 없는 대상(출차한 차량, 출하된 베일, 배치)의 줄·"이 차량 기록"·"이 배치 상세"·"이 베일 상세"(`studio`의 `RecordLink`, 링크 그리기는 `LiveStudio`가 넘긴다).
추가된 폴더: `history/`(이력 그래프 패널·구간 훅·알람 이력 훅·주요 수치 추이선 `useDeviceTrend`, 섹터·컨베이어·압축기 페이지가 공유), `devices/`(로봇팔·컨베이어·압축기 페이지 화면 테스트만. 옛 공통 틀 `MachinePage`는 2026-10-16 기기 페이지 재설계로 지웠다).
서버가 제공하지 않아 안내 문구만 둔 항목: 로봇팔 사이클 통계, 압축기 점검 이력, 설정의 현재값 (`docs/questions.md` B18, B21, B22).
- `robot/`(6단위): 자동·수동·자동 섹터 지정(`auto_pinned`), 지정 목록은 서버 상태와 초안을 구분. `set_mode`의 기존 권한·확인 흐름을 확장한다. 사이클 통계 아래 `PickRecords` = 별도 `RecordList`(`GET /robots/robot-1/picks/records`, 시각·모드·섹터·부피 m³·컨베이어 → 배치). `pickRecordsRevision` 변경 시 같은 기간·쪽을 갱신한다. 재현은 `node app/scripts/robotArm.mjs`, 결과는 `docs/screenshots/robot-arm`.
- 기기 페이지 재설계(2026-10-16, 같은 날 정리): 네 기기 모두 `DevicePage` 틀이다. 그림(히어로)이 있는 것은 섹터뿐이고(섹터는 주요 수치 칸 없이 그림 안에 수치), 로봇팔·압축기·컨베이어는 정보를 더하지 않는 그림을 지웠다(그림 없이 머리 줄 → 주요 수치 격자 → 지금/다음 → 자세히 → 기록). 폰은 아래에 붙는 조작 줄, "자세히"는 닫힌 채 시작하고 어디서나 위쪽 아래 폭 전체로 놓여 열면 칸 폭(컨테이너 쿼리 `@xl`)이 넉넉할 때 가로로 펼친다(`DetailsSection`: 왼쪽 넓은 칸 = 이력 그래프·진단 표, 오른쪽 = 설정·알람 이력).
  - 7단위(2026-10-16): 수동은 "집기" → "컨베이어에 놓기" 두 조작(`pick_from` → `place_on_conveyor`, 사이 상태 "A1에서 집음 · 놓기 대기", 서버 `heldSectorId`), 집기 기록은 두 단계(집기·놓기 시각, 수동 조작자). "적용"은 태블릿·데스크톱은 세 칸 오른쪽, 폰은 섹터 칩 줄의 마지막 칩 또는 안내 글 오른쪽. 섹터 지정 중인 배치는 배치·베일 화면·배치 팝업·대시보드·3D 홈 요약에서 계획 배합과 실제 배합(서버 `actualMix`)을 함께 보이고 "섹터 지정 중" 표시(`records/PinBadge`), 배치 팝업에 섹터 지정 기록. 3D 홈 로봇 패널에도 같은 `RobotModeControl`. 재현 `node app/scripts/robotControls.mjs`(`docs/screenshots/robot-controls`).
  - `robot/`: `robotText`(현재 작업·지금 하는 일·지금/다음 문장), `usePicksThisHour`(이번 시간 집기 = 집기 기록 목록에 정각~지금 구간을 한 줄만 요청해 서버 `total`을 그대로). 주요 수치: 모드·현재 작업·이번 시간 집기·그리퍼. 운전 모드는 `components/controls/RobotModeControl`(세 칸: 자동 | 자동 · 섹터 지정 | 수동)을 지금/다음 아래에 둔다(수동의 "집을 섹터"·선택·"집기"는 한 줄, 같은 높이·가운데선). "자세히": 진단(관절 각도 표, `ROBOT_DIAGNOSTICS_PERMISSION`이 있을 때만, 왼쪽), 설정·오류 로그·일반 정지 안내(오른쪽). 맨 아래 사이클 통계(그대로)와 집기 기록.
  - `compressor/`: `compressorText`(지금 배치 고르기: 압축 중 → 배합 중 → 계획). 주요 수치: 압력(칸 안 작은 게이지 — 지금 압력 막대와 지금 배치 목표 눈금, 숫자는 "22.5 / 27.9 MPa"로 한 번만)·온도·오늘 베일(요약)·사이클 단계(서버 `cycleStage`). 지금/다음에 배치·베일 화면 링크. 눈금 범위는 `config/display.ts`의 `PRESSURE_GAUGE_MPA`.
  - `conveyor/`: 주요 수치 가동·적재 정도·압축기로 가는 중, 지금/다음(배합 중 배치 이송, 다음 배치), 자세히(이력 그래프 왼쪽, 설정·알람 이력 오른쪽).
  - 재현: `node app/scripts/uiPolish.mjs`(2026-10-16 다듬기: 섹터 PC 1:2, 배치·베일 틀 폭, KPI 높이 고정, 지역 전환 간격, X 닫기, 알람 이력 5건, 세 크기, `docs/screenshots/ui-polish`), `node app/scripts/devicePages.mjs`(세 크기 390×844·820×1180·1440×900, 글자 100/130%, 섹터·로봇팔·압축기·컨베이어의 자세히 닫힘·열림 전체 화면과 로봇 세 모드, 결과 `docs/screenshots/device-pages`).

## 정보 배치 기준 (명세 3절)

- 홈 = "지금 정상인가": 매번 확인하고 이상이면 바로 조치할 정보. 기기당 숫자 2개 정도.
- 확대 화면 = "이 기기 상태가 어떤가": 기기를 눌렀을 때 바로 필요한 정보 + 간단한 조작 + "상세 보기".
- 기기 페이지 = "왜 그런가, 설정은, 이력은": 가끔 보거나 신중해야 하는 정보 + 위험 조작.
- 새 정보를 추가할 때 이 기준으로 어느 단계에 둘지 먼저 정한다.

## home/ 규칙

- 순서: 열린 알람(있을 때, 맨 위) → 상태 요약(시스템 상태 · 연결 · 마지막 갱신) → 지표 3장(오늘 생산 베일 · 평균 수분 · 압축기 가동률, 작은 추이선) → 섹터 4칸(적재율 막대 · 등급 · 수분 · 상태, 누르면 섹터 페이지) → 지금 배치(배합 · 평균 수분 · 목표/현재 압력, "전체 보기"는 배치·베일 화면 하나) → 6단계 공정 추적(입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하, 지금 단계 표시) → 최근 차량·베일 5건.
- 상태 요약은 어느 크기에서나 내용 높이만큼의 폭 전체 띠, 지표 3장은 태블릿부터 한 줄(3칸). 아래 카드는 폰 1단, 태블릿(md) 2단(섹터 폭 전체 → 지금 배치 | 최근 차량·베일 → 공정 추적 폭 전체), 데스크톱(xl) 3단(섹터 2칸·2×2 | 지금 배치, 공정 추적 1칸 | 최근 차량·베일 2칸). 같은 줄 카드의 내용 높이를 비슷하게 맞춰 카드 안에 큰 빈 곳을 두지 않는다. 공정 추적은 카드 폭(컨테이너 쿼리 `@lg`)이 좁으면 세로 단계, 넓으면 가로 6칸. 가로 스크롤 없음. 디자인 토큰의 흰 카드(`rounded-card border-line bg-surface shadow-soft-1`).
- 연결 끊김: 숫자는 "–", 상태는 "연결 끊김", 마지막 수신 시각을 함께. 지금 단계 강조도 없앤다. "예시 데이터"는 앱 상단 바가 보여 준다.
- 맨 위 전환(3D | 대시보드)은 화면 안이 아니라 앱 상단 바의 가운데 칸에 있다(틀 밖에서 그리는 테스트·미리 보기에서만 화면 맨 위).
- 조작 버튼은 두지 않는다(알람 확인만). 시작·일시정지 같은 홈 조작은 3D 홈의 상세 패널, 위험 조작은 기기 페이지.
- 좁은 칸의 시각은 `formatLocalClock`(오늘이면 시:분만)으로 적어 두 줄로 꺾이지 않게 한다.

## 이력 그래프 규칙 (기기 페이지)

센서값을 그때그때 보는 용도라 상세할 필요가 없다. 한 번에 한 구간만 요청해서 그린다.

| 단위 | 구간 길이 | 요청 간격(`interval`) | 점 수 |
| --- | --- | --- | --- |
| 일 (기본) | 24시간 | 10m | 144 |
| 주 | 7일 | 1h | 168 |
| 월 | 30일 | 6h | 120 |

- 처음 열면 최근 하루(`from = 지금 - 24h`, `to = 지금`, `interval = 10m`).
- 단위를 바꾸면 그 단위의 최근 구간을 다시 요청해 다시 그린다.
- 과거 보기는 **구간 단위 넘기기**: 좌우 스와이프 또는 `◀ 이전 / 다음 ▶`으로 구간 길이만큼 통째로 이동하고 그 구간을 새로 요청한다. 연속 가로 스크롤(끝에 닿으면 앞에 붙이기)은 만들지 않는다.
- 그래프 위에 현재 구간을 표시한다(예: `10/12 15:00 ~ 10/13 15:00`, 현지 시각). 최신 구간에서는 `다음 ▶`을 비활성화한다.
- 받은 구간은 `(deviceId, metric, interval, from)` 키로 기억해 두고, 다시 돌아오면 재요청하지 않는다. 단 최신 구간은 다시 요청한다.
- 불러오는 동안 이전 그래프를 흐리게 두고 로딩 표시, 실패하면 그 자리에 오류와 다시 시도 버튼.
- 알람 이력(`DeviceAlarmHistory`, 모든 기기 페이지 자세히): 최근 7일 중 **최신 5건만** 불러온다(`useAlarmHistory({ deviceId, limit: 5 })`, 서버 조회에 기기·개수 조건이 없어 앱에서 거르고 자른다). 목록은 `max-h-56` 안에서 스스로 스크롤해 자세히가 커지지 않고, 아래 "전체 알람 보기" 링크는 `alarmsPath(deviceId)` = `/alarms?device=…`(알람 화면이 그 기기 알람만 이력 탭으로 보여 주고 "모든 기기 보기"로 푼다).
- 구간 길이와 간격 표는 `config/display.ts`에 두고 여기 숫자를 코드에 박지 않는다.
- 그래프 컴포넌트(`components/charts/HistoryChart`)는 받은 점만 그리고, 구간 계산·요청·기억은 기기 페이지 쪽 훅(`useHistoryWindow`)이 맡는다.

## cctv/ 규칙

- 버튼을 누르면 별도 화면(오버레이)으로 열고, 열려 있는 동안 `ui.cctvOpen = true`로 3D 그리기 루프를 멈춘다.
- 재생 주소는 만료되는 서명 주소다. 만료되면 다시 발급받는다. 로봇 조작과 함께 볼 때는 WebRTC 우선, HLS는 참고용(수 초 지연).

## 공통 규칙 (3~7단위의 새 화면·기록도 모두 따른다)

### 페이지 틀
- 모든 화면은 `components/layout/PageContainer`(`PAGE_CONTAINER`: 가운데 정렬, 최대 폭 1600px, 세로 간격 `gap-3 md:gap-4`)로 감싼다. 화면마다 max-w를 따로 정하지 않는다. 바깥 여백은 앱 틀(`AppShell`의 main `p-4`). 예외는 한 줄 글이 긴 읽기용 상세(기록 상세 `RecordDetail` 3xl)뿐. 배치·베일 제어 화면(`BatchBalePage`)도 이 틀(`PageContainer`)을 쓴다.
- 같은 폭인지는 `node app/scripts/layoutPages.mjs`가 네 크기(390×844·820×1180·1180×820·1440×900)에서 섹터 목록·공정 기록·대시보드를 로봇팔 페이지와 비교해 본다(결과 `docs/screenshots/layout-width`).

### 폰 먼저
- 390×844(폰)에서 먼저 성립하게 만들고 820×1180(세로 태블릿)에서 넓힌다. 고칠 때마다 두 크기로 찍어 본다.
- 터치 대상은 48dp 이상(폰 아래 탭은 56). 호버에 기대지 않는다.
- 글 줄바꿈: 이름표·탭·버튼·상태 글은 한 줄, 이름·값 줄은 같은 기준선(`app/CLAUDE.md`의 글 규칙, `styles/index.css`). 짧은 글이 꺾이거나 이름표와 값이 어긋나면 안 된다. 새 화면은 `npm run test:text`(`app/scripts/textcheck.mjs`)의 점검 목록에 넣고 글자 100%·130%로 통과시킨다.

### 값은 서버에서
- 새 값은 모두 서버가 준다. 순서는 명세(`docs/dashboard-spec.md`) → `shared/` 타입 → 모의 서버 → 앱. 화면이 값을 계산·지어내지 않는다.
- 모의 서버는 실제처럼 보이는 예시 값을 만든다(가상의 회사·번호판, 그럴듯한 범위와 시각). 값이 모의 서버에서 오는 동안 "예시 데이터" 표시를 유지한다(앱 상단 바 하나, 3D 홈에서도 같은 바).
- 시각은 UTC ISO 문자열로 받고 저장하며, 화면에만 현지 시각으로 적는다(`formatLocalTime`, 좁은 칸은 `formatLocalClock`).

### 연결 끊김
- 실시간 값은 "–"로 바꾸고 "연결 끊김"과 마지막 수신 시각을 함께 보인다. 움직임(애니메이션·3D·그림)은 멈춘다(`useDeviceLive`, `data-frozen`, 스튜디오 고정 규칙 3).
- 지난 기록 목록(`RecordList`)은 받은 줄을 그대로 두고 끊김 줄을 띄우며, 다시 연결되면 같은 쪽을 새로 받는다.

### 파지의 양 (명세 6절 "공통 규칙", `docs/decisions.md` 2026-10-15 "파지의 양 기준")
| 대상 | 쓰는 값 |
| --- | --- |
| 차량·하역 기록 | 계중대 순중량 t (총중량 − 공차). 총중량·공차·순중량 셋 다 서버가 저장하고 보낸다(`grossT`, `tareT`, `netT`) |
| 섹터 상태 | 적재율 %와 부피 m³ |
| 로봇 집기 | 부피 m³ 또는 횟수 |
- 무게는 차량·하역 기록에만 쓴다(옛 "무게는 쓰지 않는다" 규칙을 이 경우에만 바꿨다). 확인 전 가정이다(`docs/questions.md` A12).

### 기록 목록
- 지난 기록은 모두 `components/records/RecordList`로 보여 준다: 기간(오늘·어제·최근 7일·직접 선택), 10줄씩, 이전·쪽 번호·다음, 빈 목록 "이 기간에 기록이 없습니다". 폰은 쌓인 줄(제목·시각 / 설명 한 줄), 태블릿·데스크톱은 작은 표.
- 검색: `RecordList`에 `searchPlaceholder`를 주면 기간 아래에 검색 상자(돋보기·입력·X)가 붙는다. **기간 AND 검색어**를 서버에 함께 보낸다(`q`, 명세 6절). 입력은 300ms(`SEARCH_DEBOUNCE_MS`) 기다렸다가 보내고(Enter·X는 바로), 검색어나 기간이 바뀌면 1쪽부터 다시 받는다. 결과가 없으면 "검색 결과가 없습니다" 아래에 기간과 검색어를 적는다(검색어 없이 빈 기간은 예전 "이 기간에 기록이 없습니다"). 안내 글(placeholder)은 서버가 찾는 값과 같아야 하고 `config/display.ts`의 `RECORD_SEARCH_HINT`에 둔다: 차량·하역 "번호판, 회사", 배치 "배치 ID, 섹터", 베일 "베일 ID, 배치 ID", 집기 "섹터, 배치 ID", 사건 "배치·베일 ID, 사건 종류, 수행자", 알람 "기기 이름, 알람 내용". 규칙(대소문자·공백 무시 부분 일치, 번호판 "12가3456"이 "12가 3456"을 찾음)은 `shared/src/search.ts`.
- 알람 화면의 이력 탭은 같은 조각(`components/records/RecordFilters`의 `RangeFilter`·`SearchBox`, 상태 훅 `useRecordRange`·`useSearchText`)을 쓰고 `GET /alarms?from&to&q`(쪽 나누기 없는 배열)로 받는다. 처음은 최근 7일이고 오늘·최근 7일은 `to`를 보내지 않는다("지금까지"). 열린 알람 탭은 실시간 값이라 기간·검색이 없다. `?device=` 거르기는 그대로 앱에서 한다.
- 재현: `node app/scripts/recordSearch.mjs`(390×844·1440×900: 공정 기록 세 탭·섹터 하역 기록·알람 이력의 검색, 결과 없음, 공백 무시, X, `docs/screenshots/record-search`).
- 서버 엔드포인트는 `GET .../records?from&to&page&pageSize` → `{ items, total, page, pageSize }`(명세 6절 "기록 목록", `shared/records.ts`). `load`는 `getRecords<T>(경로, query, signal)`로 넘긴다. 모의 서버는 `routes/records.ts`의 `sendRecordPage`로 응답한다.

### 조작
- 기존 명령 흐름만 쓴다: 권한은 `/me`(`selectCan`)로 표시만, 위험 조작은 기기 페이지 + 확인 단계(`confirm: true`), 요청마다 `Idempotency-Key`, 결과는 `command.result`(못 받으면 `GET /commands/{id}`)와 `CommandResultToast`. `components/controls`를 다시 쓰고 새 버튼에서 `api`를 직접 부르지 않는다.

### 그 밖
- 화면은 store 선택자와 `api` 훅으로만 데이터를 얻는다.
- 위험 조작은 기기 페이지에서만(`components/controls`의 `context='page'`). 예외: 3D 홈 로봇 패널의 운전 모드(같은 컴포넌트·확인 단계, 루트 `CLAUDE.md` 규칙 2).
- 화면을 떠날 때 그 화면이 연 구독(관절 값 등)을 해제한다.


## 기록 상세 팝업 (2026-10-16, `docs/decisions.md` "기록 상세는 팝업, 이력 깊이 1")
- 차량·배치·베일 상세는 페이지가 아니라 지금 화면 위의 팝업이다: `features/records/popup/RecordPopupLayer`(라우트 전체를 감싸 화면은 뒤에 깔린 주소로 그리고 그 위에 팝업 하나), `RecordPopup`(`Dialog size="popup"`·베일은 `popupNarrow`, 제목 줄 오른쪽 X 아이콘 닫기 버튼, 이름표 "닫기"), 본문 `VehicleDetail`·`BatchDetail`·`BaleDetail`(`useRecord`·`RecordFrame`·`DetailSection`·`DetailRow`).
- 여는 쪽은 `components/records/recordPopup`의 `PopupLink`(링크) 또는 `useOpenRecordPopup()`(목록 줄)만 쓴다. 주소를 직접 만들어 `navigate`하지 않는다(뒤 화면 정보가 빠진다).
- 이어 열기·닫기·뒤로 가기·깊은 링크의 규칙은 `RecordPopupLayer` 머리 주석. 앱이 기억하는 팝업은 지금 것과 바로 전 것 둘뿐이고, 닫기는 어느 방법이든 지금 것 하나만 닫는다. 바로 전 팝업이 있으면 제목 아래에 "닫으면 이전 팝업(…)이 다시 보입니다".
- 초점: 열면 닫기 버튼, Tab은 팝업 안에서만, 모두 닫으면 처음 누른 곳으로 돌아온다(`Dialog`). 열린 동안 `ui.recordPopupOpen`으로 3D 홈 그리기를 멈춘다.
- 재현: `node app/scripts/recordPopups.mjs` (390×844·1440×900, 팝업 셋·베일 → 배치 → 베일·뒤로 가기·깊은 링크·대시보드, `docs/screenshots/record-popups`).

## 5단위 배치·베일
- `/records/batches` (`BatchBalePage`): 현재 배치 요약, 현재/다음 선택, `BatchControls`, 사건 `RecordList`. `useBatchControl`은 서버 현재 상태를 2초마다 조회하며 명령 결과와 재연결 때 다시 받는다. 초안 입력과 서버 확정값은 분리한다.
- 베일 상세 팝업(`BaleDetail`, 주소 `/records/bales/:id`): 생산 당시 압력·수분·배합 스냅샷, 적치/출하 상태, "배치 보기". 배치 팝업의 "베일 보기"와 현재 배치의 베일 링크로 연다.
- `batch.control` 권한은 관리자만 주는 가정. 명령은 기존 `useDeviceCommand`·`ConfirmDialog`·`CommandResultToast` 사용. 상태/범위/승인은 서버가 결정한다.
- 사건 줄을 누르면 그 사건의 베일(베일 생산) 또는 배치 팝업을 바로 연다(따로 된 "사건 상세" 없음, 변경·사유·수행자는 목록 줄에 있다). `eventsRevision` 변경 시 같은 기간·쪽을 새로 조회한다.
- 재현: `node app/scripts/batchBale.mjs` (실제 목업 명령 검증, 두 크기·글자 100/130%, `docs/screenshots/batch-bale`). 전체 글 검사에도 새 화면을 포함한다.

## 7단위 KPI 상세
- 모든 팝업(차량·배치·베일·KPI 상세)은 `Dialog`의 `closeLabel="닫기"`로 같은 X 아이콘 닫기 버튼(오른쪽 위, 글자 없음)을 쓴다. 글자 "닫기" 버튼을 따로 만들지 않는다.
- 두 홈의 세 KPI는 `HomePage`가 제공하는 `KpiDetailContext`로 같은 `KpiDetail`을 연다. studio는 features를 import하지 않는다. 폰은 하단 시트, 640px 이상은 대화상자. 열린 동안 뒤의 3D 그리기는 멈춘다.
- `GET /plant/kpi-history`: 현지 자정 기준 오늘·7일·30일, 구간 생산량·수분 목표 범위·가동/정지 분·통계는 모두 서버 값. 기존 추이선 API는 그대로 둔다.
- 불러오는 동안 "불러오는 중…"은 기간 줄(날짜 범위) 자리에 쓰고, 그래프 칸은 높이를 고정해(`h-60 sm:h-72`, 이전 데이터는 흐리게, 처음·빈 기간·오류는 같은 높이의 빈 칸) 기간을 바꿔도 아래가 밀리지 않는다.
- 요청 취소로 기간 전환의 응답 역전을 방지한다. 끊기면 현재값은 “–”, 받은 이력과 마지막 갱신은 유지, 재연결 시 다시 조회한다.
- 재현: `node app/scripts/kpiDetails.mjs`. 360/390/820px·글자 100/130%, 두 홈, 세 기간, 오류 재시도·초점 복귀·끊김 및 API 검증. 스크린샷은 `docs/screenshots/kpi-detail`. 전체 글 검사에도 포함한다.
