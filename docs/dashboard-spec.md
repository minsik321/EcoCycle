# 스마트 폐지 처리 대시보드 개발 플랜 및 API 명세서

Oct 17, 2026 · @민식 · 현재 구현(모의 서버 + 앱) 기준으로 정리한 판

이 문서는 지금 동작하는 것을 적은 **단일 기준**이다. 결정의 이유는 `docs/decisions.md`, 아직 답을 받지 못한 질문은 `docs/questions.md`에 있다.
⚠ 표시는 서버 담당·대표님과 합의하기 전의 프론트 제안안이며, 질문 번호(A·B)를 함께 적었다.

## 개요와 확정 사항

파지 선별·압축 설비를 한 화면에서 보고 조작하는 안드로이드 태블릿 우선 대시보드다. 이 문서는 프론트 범위(화면·앱·모의 서버)와 서버가 제공해야 할 API를 정한다.

| 항목 | 확정 내용 |
| --- | --- |
| 대상 기기 | 안드로이드 태블릿 우선, 폰은 요약 화면 중심. 태블릿 기종 제한 없음 |
| 개발 방식 | 웹(React)으로 만든 뒤 Capacitor로 안드로이드 앱 빌드 |
| 접속과 보안 | 현장 밖에서도 접속하며 로그인으로 보호. 서버 쪽 보안 설정은 서버 담당과 확인(`questions.md` B2) |
| 운전 방식 | 자동 운전은 서버가 처리, 대시보드는 사람이 보고 수동으로 조작하는 용도 |
| 사용자 | 회사 내부 관계자 소수 |
| 로그인과 권한 | 서버가 판단한다. 앱은 `GET /me`의 권한으로 버튼을 숨기거나 막을 뿐이다(6절 "권한 표") |
| 비상정지 | 현장의 물리 버튼과 안전 인터록이 맡는다. 앱에는 비상정지를 만들지 않는다 |
| 진행 방식 | 가정 기반 프로토타입을 먼저 전달하고 피드백으로 고친다(7절) |

### 용어집

| 용어 | 뜻 |
| --- | --- |
| 섹터 | 파지를 등급별로 쌓아 두는 수납 칸 A1·A2·B1·B2. 예전 이름 "탱크"와 같은 대상이고 기기 ID·주소는 `tank-…`를 그대로 쓴다. 화면 글은 "섹터 A1"처럼 적는다 |
| 배치(batch) | 섹터 배합·평균 수분·목표 압력을 정해 압축기에 공급하는 혼합 작업 한 번 |
| 베일(bale) | 압축·결속해 배출한 블록 하나. 목업은 배치당 1개, 모델은 `Batch.baleIds[]`·`Bale.batchId`로 1→N을 허용한다 |
| 섹터 지정 | 로봇 모드 `auto_pinned`("자동 · 섹터 지정"): 배합 순서 대신 사람이 고른 섹터만 돌며 집는다 |
| 공정 흐름 | 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하. 차량·배치·베일의 `stage`로 표현한다 |

## 범위와 역할 분담

| 영역 | 담당 | 내용 |
| --- | --- | --- |
| 대시보드 화면 | 프론트 | 3D 홈·대시보드 홈, 기기 페이지, 공정 기록, 알람, 설정, CCTV, 권한별 표시 |
| 안드로이드 앱 | 프론트 | Capacitor 빌드와 배포(APK 또는 Firebase App Distribution) |
| 모의 서버 | 프론트 | 서버 준비 전까지 6절의 API를 같은 모양으로 흉내 내는 개발용 서버(가상의 회사·번호판, 그럴듯한 값) |
| 센서·로봇 데이터 수집과 API | 서버 ⚠(A1) | 6절의 조회 API와 실시간 스트림 |
| 로그인과 권한 검증 | 서버 ⚠(B1) | 토큰 발급, 요청마다 권한 검증, 명령 차단 |
| 푸시 알림 발송 | 서버 ⚠(B7) | 이상 감지 시 FCM 발송 |
| CCTV 영상 변환 | 서버 ⚠(B8) | RTSP → HLS 또는 WebRTC, 접근 권한이 걸린 만료 주소 발급 |
| 비상정지와 안전 인터록 | 현장 설비 | 앱과 네트워크에 의존하지 않는다 |
| 로봇 AI 학습 | 별도 | 이 문서의 범위 밖 |

## 화면 구성

정보는 세 단계로 나눈다: 홈은 "지금 정상인가", 상세 패널(3D 홈에서 대상을 고른 화면)은 "이 기기는 어떤가", 기기 페이지는 "왜 그런가, 설정은, 이력은".

### 앱 틀

- **상단 바 하나**: 어느 화면에서나 떠 있는 둥근 판(높이 56px). 왼쪽부터 로고 · "예시 데이터"(값이 모의 서버에서 올 때) · 가운데 칸(홈에서만 "3D | 대시보드" 전환) · 연결·시계(끊기면 "연결 끊김"과 마지막 수신 시각) · 알람 · CCTV · 사용자 메뉴(이름·역할, 설정, 로그아웃). 폰에서는 알람이 아래 탭 바로, CCTV가 사용자 메뉴 안으로 간다.
- **주 메뉴 하나**: 홈, 섹터, 로봇팔, 컨베이어, 압축기, 알람, 공정 기록, 설정. 폰은 아래 탭 바(홈·섹터·로봇팔·알람 + "더 보기"), 태블릿·데스크톱은 왼쪽 사이드바(어느 화면에서나 같은 폭, 접기 상태는 기기에 기억). 권한으로 메뉴를 가르지 않는다(모든 역할에게 모든 메뉴, 6절 "권한 표").
- **팝업**: 차량·배치·베일 기록 상세, KPI 상세는 지금 화면 위의 팝업이다(X 닫기, 초점 가두기, 닫으면 누른 곳으로). 팝업에는 명령 버튼이 없다.
- **조작 결과**: 보낸 명령의 결과(접수 → 완료·거부·실패)는 어느 화면에서나 알림 카드로 보인다.

### 화면 목록

| 화면 | 주소 | 내용 | 조작 |
| --- | --- | --- | --- |
| 로그인 | `/login` | 아이디·비밀번호, "자동 로그인" | 없음 |
| 3D 홈 | `/` (3D) | 공장 장면(입고 도로·게이트·계중대, 본관의 섹터 4칸, 로봇팔, 컨베이어 Section Z, 압축기, 출하 마당), 지표 카드 3개, 6단계 공정 추적, 표(차량·섹터·배치·베일), 핀, 상세 패널 | 상세 패널: 시작·일시정지·재개·정지, 로봇 운전 모드(아래) |
| 대시보드 홈 | `/` (대시보드) | 열린 알람, 상태 요약, 지표 3장, 섹터 4칸, 지금 배치, 6단계 공정 추적, 최근 차량·베일 5건 | 알람 확인 |
| 섹터 목록 | `/tanks` | 섹터 칸 그림(적재율·부피, 수분·등급·상태) | 없음 |
| 섹터 상세 | `/tanks/{tank-…}` | 칸 그림 안의 적재율·부피와 서버 주의선, 지금/다음, 자세히(이력 그래프·설정·알람 이력 5건), 하역 기록 | 알람 확인, 설정값 변경 |
| 로봇팔 | `/robot` | 모드·현재 작업·이번 시간 집기·그리퍼, 운전 모드 카드, 자세히(진단 관절 표·설정·오류 로그), 사이클 통계, 집기 기록 | 시작·일시정지·재개·정지, 운전 모드, 설정값 변경 |
| 컨베이어 | `/conveyor` | 가동·적재 정도·압축기로 가는 중, 지금/다음, 자세히(이력·설정·알람 이력) | 시작·일시정지·재개·정지, 설정값 변경 |
| 압축기 | `/compressor` | 압력 게이지(지금 vs 지금 배치 목표)·온도·오늘 베일·사이클 단계, 지금 배치, 자세히(이력·설정·알람·점검 이력 안내) | 시작·일시정지·재개·정지, 설정값 변경 |
| 공정 기록 | `/records?tab=vehicles\|batches\|bales` | 차량·배치·베일 기록 목록(기간 + 검색, 10줄씩). 줄을 누르면 상세 팝업 | 없음 |
| 기록 상세 팝업 | `/records/vehicles/{id}`, `/records/batches/{id}`, `/records/bales/{id}` | 팝업 하나와 바로 전 팝업 하나까지 기억(배치 → 베일 이어 열기, 뒤로 가기). 주소를 바로 열면 공정 기록 위에 뜬다 | 없음 |
| 배치·베일 | `/records/batches` | 지금·다음 배치 요약(계획 배합과 섹터 지정 중이면 실제 배합), 수동 제어, 배치·베일 사건 기록 | 배합·목표 압력 변경, 배치 일시정지·재개, 건너뛰기 |
| 알람 | `/alarms` (`?device=`) | 열린 알람(실시간) / 이력(기간 + 검색). 누르면 기기 페이지 | 알람 확인 |
| 설정 | `/settings` | 계정(이름·역할·할 수 있는 조작), 화질 모드(자동·고화질·기본·저사양), 앱 정보 | 로그아웃(명령 아님) |
| CCTV | 오버레이 | 카메라 고르기, 발급받은 주소 재생. 열린 동안 3D 그리기를 멈춘다 | 없음 |

개발용 화면(로그인 불필요, 값은 모두 예시): `/scene-demo`(3D 홈만, 프레임 측정), `/design`, `/design/device`, `/design/records`.

### 3D 홈과 대시보드 홈

- 홈 맨 위의 전환 "3D | 대시보드"로 오가고, 고른 쪽은 기기에 기억한다(기본 3D). WebGL을 쓸 수 없거나 3D에서 오류가 나면 대시보드로 보여 주고 짧게 알린다. 대시보드는 3D 라이브러리를 내려받지 않는다.
- 3D 홈 배치는 폰(390×844) → 세로 태블릿(820×1180) → 데스크톱 순으로 맞춘다. 폰은 지표 칩 한 줄 + 아래 시트(공정 막대, 배치·차량·섹터·베일 탭), 태블릿·데스크톱은 지표 카드, 오른쪽 상세 패널, 아래 표(접기 기억)와 공정 추적.
- 카메라: 거리 세 단계(부지 전체 · 한 구역 · 고른 대상), 지역 전환, 끌어서 이동, 핀치·휠 확대(거리 제한), 위아래 기울기 24~74도, 지도 도구로 45도씩 돌리기. 핀이나 표의 줄을 누르면 그 대상으로 다가가고 움직이면 따라간다. 장면에 없는 대상(출차한 차량, 출하된 베일, 배치)은 카메라를 두고 기록 상세 팝업만 연다.
- 상세 패널: 상태와 주요 값 4~5줄 + "자세히", 그 기기의 알람(표시만), 조작(시작·일시정지·재개·정지), 로봇이면 운전 모드, "상세 보기"(기기 페이지). 위험 조작은 로봇 운전 모드 하나뿐이고 기기 페이지와 같은 컴포넌트·확인 단계다.
- 지표: 오늘 생산 베일, 평균 수분, 압축기 가동률(작은 추이선). 누르면 KPI 상세 팝업(오늘·7일·30일, 서버 집계).
- 6단계 공정 추적은 서버 `stageTimes`를 표시만 한다. 차량·배치·베일을 하나의 사이클로 묶는 값은 서버에 없으므로 "출차하지 않은 가장 최근 차량, 진행 중인 배치, 가장 최근 베일"을 나란히 보여 준다.
- 트럭·지게차·작업자의 경로·속도는 화면 연출이고 센서 값이 아니다. 움직임은 받은 `stage`까지만 간다. 출하 마당은 고정 칸이고 칸이 차면 압축기가 기다리는 연출을 한다.

### 기기 페이지

- 네 기기 모두 같은 틀: 머리(이름·상태) → 주요 수치(최대 4개) → 지금/다음 → 조작 줄(위험도 낮은 조작 + 이 기기의 알람 확인) → 자세히(처음엔 닫힘: 이력 그래프 · 설정 · 알람 이력 5건) → 기록. 그림이 있는 것은 섹터뿐이다.
- 이력 그래프: 일(24시간·10분 간격) / 주(7일·1시간) / 월(30일·6시간), 구간 단위로 넘긴다.
- 로봇 운전 모드 카드(로봇팔 페이지·3D 홈 로봇 패널 같은 컴포넌트): 세 칸 자동 | 자동 · 섹터 지정 | 수동. 칸을 고르는 것은 초안이고 "적용"을 눌러 확인 단계를 거쳐야 명령이 나간다. 서버가 확정한 모드에 "지금"이 붙는다. 수동은 "집기"(섹터에서 집어 듦) → "컨베이어에 놓기" 두 조작이며 사이 상태("A1에서 집음 · 놓기 대기")를 보여 준다. 머리에 마지막 로봇 명령의 결과(적용 대기 → 적용됨·거부됨).
- 설정 폼은 현재 설정값을 읽는 API가 없어(B18) 마지막으로 보낸 값만 알려 준다. 로봇 사이클 통계(B21)·압축기 점검 이력(B22)은 서버 API가 없어 안내 문구만 둔다.

### 기록 목록 (화면)

- 모든 지난 기록은 같은 목록이다: 기간(오늘·어제·최근 7일·직접 선택) + 검색 상자, 10줄씩, 이전·쪽 번호·다음. 폰은 쌓인 줄, 태블릿·데스크톱은 작은 표.
- 검색은 기간과 **함께** 서버가 거른다(6절 "기록 목록"). 입력 300ms 뒤 보내고, 검색어·기간이 바뀌면 1쪽부터. 결과가 없으면 "검색 결과가 없습니다"와 기간·검색어.
- 기록 목록: 섹터 하역(섹터 상세), 로봇 집기(로봇팔), 차량·배치·베일(공정 기록), 배치·베일 사건(배치·베일), 알람 이력(알람: 쪽 나누기 없이 처음 최근 7일).

### 홈과 기기 페이지의 조작 나누기

기준은 "되돌리기 쉽고 위험이 낮은가"다. 역할별로 누가 할 수 있는지는 6절 "권한 표".

| 홈(3D 홈 상세 패널·대시보드)에서 가능 | 기기 페이지(와 배치·베일 화면)에서만, 확인 단계 |
| --- | --- |
| 시작, 일시정지, 재개, 정지(3D 홈 상세 패널) | 설정값 변경(`update_setting`) |
| 알람 확인(대시보드 홈) | 배치 배합·목표 압력 변경, 배치 일시정지·재개, 건너뛰기(`batch.control`) |
| 로봇 운전 모드(3D 홈 로봇 패널, 예외: 기기 페이지와 같은 확인 단계) | 로봇 운전 모드(로봇팔 페이지) |

### 연결 끊김

- 15초 동안 메시지가 없으면 "연결 끊김"과 마지막 수신 시각을 보여 주고, 실시간 값은 "–"로, 모든 움직임(로봇팔·트럭·지게차·컨베이어·압축기·작업자·그림 전환)을 멈춘다. 마지막 값을 정상처럼 보여 주지 않는다.
- 조작 버튼은 모두 비활성 + 이유. 지난 기록 목록은 받은 줄을 그대로 두고 끊김 줄을 띄운다.
- 복구되면 REST로 현재 상태(요약·기기·열린 알람·`GET /process/state`)를 다시 받아 맞춘다. 지나간 구간을 재생하지 않는다.

## 기술 구성

서버가 값을 모으고 권한을 검증하며, 앱은 그리고 명령을 보내기만 한다. 개발 중에는 모의 서버가 서버 자리를 대신한다.

| 영역 | 선택 | 메모 |
| --- | --- | --- |
| 프론트 | React + TypeScript + Vite, Redux Toolkit, Tailwind | 웹으로 먼저 확인 |
| 3D | three + react-three-fiber | 3D 홈을 고를 때만 내려받는다(패널 조각과 3D 조각을 나눔) |
| 앱 | Capacitor | 웹 코드를 안드로이드 앱으로 |
| 실시간 | WebSocket 하나, REST는 조회와 명령 | 서버가 값을 밀어 준다 |
| 영상 | HLS(hls.js, 열 때만 내려받음) 또는 WebRTC | 서버가 변환, 앱은 `<video>`로 재생 |
| 알림 | 앱이 켜져 있으면 WebSocket, 닫혀 있으면 FCM | 푸시는 지연·누락될 수 있다 |
| 계약 | `shared/` 타입을 앱과 모의 서버가 함께 import | API가 바뀌면 명세 → `shared/` → 모의 서버 → 앱 |

성능 원칙:

1. 화질은 3단계다. `low`는 미리 구운 바닥 그림자·후처리 없음·단색 패널, 화면 배율 1, 초당 30장 이하. `standard`는 그림자 지도·주변 차폐(반 해상도)·주요 패널만 약한 흐림. `high`(모든 기기의 기본)는 빛 번짐·얕은 심도·모든 패널 유리. 접속 때 짧은 프레임 측정으로 성능이 낮으면 단계를 내리고, 설정에서 직접 고를 수 있다. `low`는 끊김 없이 도는 것이 유일한 기준이고 상위 단계의 연출이 이 기준을 깨면 안 된다.
2. 필요할 때만 그린다: 움직임이 없으면 그리지 않고, 화면이 숨겨지거나 CCTV·기록 팝업·KPI 팝업이 열리면 그리기를 멈춘다.
3. 관절 값만 초당 10~20회 받고 0.15초 지연 버퍼로 보간한다. 나머지 값은 변할 때와 최소 5초마다.
4. 로봇팔 그리기는 입력(실시간 관절 값·시연 동작·고정 자세)과 분리되어 있다.
5. 첫 화면: 로그인 화면에서 한가할 때 3D 정적 파일만 미리 받고(API 호출 없음), 로그인 뒤 패널을 먼저 그린 다음 3D 장면을 올린다(빈 장면 포스터를 덮어 둔다).
6. 실제 저사양 태블릿에서 30분 이상 구동해 끊김·발열을 확인한 뒤 연출을 더한다(2단계 완료 기준, 아직 측정 전).

## 개발 단계

| 단계 | 목표 | 완료 기준 | 상태 |
| --- | --- | --- | --- |
| 0. 준비 | 가정 정리, 프로토타입 전달 | 가정 표와 프로토타입 전달, 피드백 수집 | 전달 준비 |
| 1. 핵심 기능 | 로그인, 기기 페이지, 센서 수치, 알람, 권한별 화면, CCTV를 모의 서버로 | 권한별 화면 분기와 연결 끊김 표시 동작 | 완료 |
| 2. 3D 홈 시안 | 공장 장면, 섹터 적재율, 모의 관절 값으로 로봇팔, 공정 흐름 연출, 화질 3단계 | 실제 태블릿 30fps 안정, 30분 이상 끊김·발열 없음 | 구현 완료·범위 확장 재작업 중, 실기기 측정 남음 |
| 3. 실서버 연동 | 모의 서버를 실제 API로 교체, 관절 값 매핑(축 수·영점·단위) | 실제 값으로 로봇팔 구동, 끊기면 정지·표시 | 대기 |
| 4. 장시간·현장 테스트 | 장시간 구동(메모리·재연결), 앱 배포 | 하루 이상 구동해도 느려짐·멈춤 없음 | 대기 |
| 5. 확장 | 압축기 이후 공정 | 2단계에서 여유가 확인된 경우만 | 대기 |

로봇팔을 실제 움직임에 맞추는 수단은 ① 관절 각도·그리퍼 값 실시간(지금) → ② 단계 + 진행률 → ③ 정해진 동작 반복(최후, 주소에 `?demo=1`) 순으로 시도한다.

## API 명세서

대시보드는 REST로 현재 값과 이력을 조회하고, WebSocket 하나로 실시간 값을 받으며, 명령은 REST로 보낸다. 모든 권한 판단은 서버가 한다. 모의 서버는 이 절 전체를 구현한다(예외는 각 항목에 적었다). 서버 담당과 합의하며 바꾼다.

### 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| 기본 주소 | `https://{server}/api/v1`, 실시간은 `wss://{server}/ws/v1/stream` |
| 형식 | JSON, UTF-8 |
| 시각 | ISO 8601 UTC 문자열(예: `2026-10-13T05:23:11.250Z`). 화면에 적을 때만 현지 시각 |
| 단위 | 적재율·수분·적재 정도 %(0~100), 부피 m³, 압력 MPa, 온도 °C, 각도 도, 무게 t(차량·하역 기록에만). 필드 이름에 단위를 드러낸다(`fillPercent`, `volumeM3`, `pressureMpa`, `temperatureC`, `netT`) |
| 인증 | `Authorization: Bearer {accessToken}`. WebSocket은 1회용 티켓 |
| 기기 ID | `tank-a1`, `tank-a2`, `tank-b1`, `tank-b2`, `robot-1`, `conveyor-z`, `compressor-1` (고정) |
| 섹터 이름 | 섹터 = 기존 탱크. ID는 `tank-a1`, 짧은 이름 `A1`, 화면 이름 `섹터 A1`. 검색은 세 이름을 모두 찾는다 |
| 상태 판정 | `status`는 서버가 기준값으로 정해서 보낸다. 화면은 표시만 한다 |
| 오류 형식 | `{"error":{"code":"FORBIDDEN","message":"..."}}` |

| 상태 코드 | 의미 | 클라이언트 처리 |
| --- | --- | --- |
| 401 | 토큰 없음·만료 | 리프레시로 재발급 후 1회 재시도(동시에 여러 요청이 401이어도 리프레시는 한 번). 리프레시가 거부되면 로그인 화면 |
| 403 | 권한 없음(`FORBIDDEN`), 허용되지 않은 출처(`ORIGIN_NOT_ALLOWED`) | 조작 거부 안내 |
| 404 | 기록 한 건이 없음(`/vehicles/{id}` 등) | "기록을 찾을 수 없습니다" |
| 409 | 현재 상태에서 불가(`CONFLICT`, 예: 이미 작동 중, 수동 순서 위반) | 이유를 표시 |
| 422 | 잘못된 값(`VALIDATION_FAILED`) | 입력 오류 표시 |
| 429 | 요청 너무 많음(로그인 실패 60초에 5회 초과 등) | GET과 멱등 키가 있는 명령만 `Retry-After`만큼 기다려 최대 2번 재시도(5초 넘으면 바로 오류) |
| 503 | 서버 준비 안 됨·없는 경로 | 연결 끊김 표시 |

파지의 양은 대상마다 하나의 기준으로 적는다(⚠ A12, 이유: `decisions.md` 2026-10-15 "파지의 양 기준").

| 대상 | 양의 기준 | 필드 |
| --- | --- | --- |
| 차량·하역 기록 | 계중대 순중량 t = 총중량 − 공차. 세 값을 모두 서버가 저장하고 보낸다 | `grossT`, `tareT`, `netT` |
| 섹터 상태 | 적재율 %와 부피 m³ | `fillPercent`, `volumeM3`, `capacityM3` |
| 로봇 집기 기록 | 부피 m³ | `volumeM3` |

섹터·기기 상태와 실시간 메시지(공정 흐름 포함)에는 무게 필드가 없다. 3D 홈의 계중대는 진행 표시만 한다.

### 인증

| 메서드와 경로 | 설명 | 요청 | 응답 |
| --- | --- | --- | --- |
| POST `/auth/login` | 로그인 | `{"id","password","remember","refreshTokenDelivery"}` | `{"accessToken","refreshToken"(body 방식만),"expiresIn","user"}` (`user`는 `/me`와 같다) |
| POST `/auth/refresh` | 토큰 재발급. 리프레시 토큰은 쓸 때마다 교체 | 웹: 본문 `{}` + 쿠키, 앱: `{"refreshToken"}` | `{"accessToken","refreshToken"(body 방식만),"expiresIn"}` |
| POST `/auth/logout` | 세션(리프레시 토큰 묶음) 폐기, 쿠키 삭제 | 웹: 본문 `{}` + 쿠키, 앱: `{"refreshToken"}` | 204 |
| POST `/auth/ws-ticket` | WebSocket 연결용 1회용 티켓(30초) | 없음 | `{"ticket","expiresIn"}` |
| GET `/me` | 내 정보와 권한 | 없음 | `{"id","name","role","permissions"}` |

- `role`: `admin`(관리자), `operator`(작업자), `viewer`(열람자). ⚠ 실제 권한 종류는 대표님과 정한다(A4).
- `permissions`: `batch.control`, `robot.control`, `robot.manual`, `settings.write`, `alarm.ack` 중 그 사람이 가진 것. 화면은 이 목록만 보고(역할 이름으로 가르지 않는다) 버튼을 숨기거나 막는다.
- 액세스 토큰 유효 시간 15분(모의 서버). 로그인 실패는 아이디당 60초에 5회까지, 넘으면 429.

#### 토큰 보관과 자동 로그인

액세스 토큰은 앱 메모리에만 둔다. 어떤 토큰도 localStorage·sessionStorage·주소(URL)에 두지 않는다(이유: `decisions.md` 2026-10-15 "자동 로그인"). 리프레시 토큰은 앱이 어디서 도는지에 따라 두 방식 중 하나다.

| 항목 | 웹 (`refreshTokenDelivery: "cookie"`) | 안드로이드 앱 (`"body"`) |
| --- | --- | --- |
| 보관 | 서버가 쿠키로 심는다. 스크립트는 읽을 수 없다 | Android Keystore 기반 보안 저장소 |
| 응답 | 본문에 `refreshToken`이 없고 `Set-Cookie`만 | 본문에 `refreshToken`, 쿠키 없음 |
| 리프레시·로그아웃 요청 | 본문 `{}`, `credentials: "include"` | 본문 `{"refreshToken"}` |
| `remember: true` (자동 로그인) | 지속 쿠키 `Max-Age` 14일 | 보안 저장소, 앱을 다시 켜도 유지 |
| `remember: false` | 세션 쿠키(`Max-Age` 없음), 브라우저를 닫으면 사라짐 | 메모리에만, 앱을 닫으면 사라짐 |

- 빼면: `remember`는 `false`, `refreshTokenDelivery`는 `"body"`.
- 쿠키: 이름 `ecocycle_rt`, `HttpOnly`, `Secure`, `Path=/api/v1/auth`. `SameSite`는 앱과 API가 같은 사이트면 `Lax`, 다른 사이트(예: Vercel + Render)면 `None` + `Partitioned`.
- CORS: `Access-Control-Allow-Credentials: true`와 **명시한 출처 목록**만(`*` 불가). 쿠키로 온 로그인·리프레시·로그아웃은 `Origin`도 같은 목록으로 확인하고 아니면 403 `ORIGIN_NOT_ALLOWED`.
- 리프레시 토큰 유효 시간: 자동 로그인 14일, 아니면 12시간. 리프레시할 때마다 새 토큰이 같은 시간으로 다시 시작한다.
- **교체와 재사용 감지:** 리프레시할 때마다 새 리프레시 토큰을 주고 이전 토큰은 사용 완료로 표시한다. 이미 쓴 토큰이 다시 오면 그 세션의 모든 리프레시·액세스 토큰, WebSocket 티켓·연결을 폐기하고 401 `REFRESH_TOKEN_REUSED`.
  - **유예 30초:** 교체 직후 30초 안에 **바로 앞** 토큰이 다시 오고 그 교체로 준 새 리프레시 토큰이 아직 쓰이지 않았으면, 재사용으로 보지 않고 **방금 준 새 토큰 쌍을 그대로 다시** 준다(200, 쿠키도 같은 값). 30초가 지났거나 그 뒤 교체가 또 일어났으면 세션을 폐기한다(이유: `decisions.md` 2026-10-15 "리프레시 재사용 감지에 30초 유예").
- 리프레시 거부 코드(401): `REFRESH_TOKEN_MISSING`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `UNAUTHORIZED`(모르는 토큰, 서버 재시작 등). 거부할 때 웹 쿠키도 지운다.
- 앱 시작: 웹은 항상, 앱은 보안 저장소에 토큰이 있으면 `POST /auth/refresh` → 성공하면 `GET /me`로 최신 권한을 받아 로그인 화면 없이 들어간다(그동안 "로그인 확인 중…"). 거부되면 로그인 화면, 서버에 닿지 못하면 토큰을 지우지 않고 다시 시도하게 안내한다.
- 로그아웃: 서버가 세션을 폐기하고 쿠키를 지운다. 앱은 보안 저장소·메모리의 토큰을 지운다(서버 요청이 실패해도).
- 웹은 탭 사이에서 리프레시를 한 번에 하나만 보낸다(Web Locks).
- 권장(서버): 로그인 시도 제한, 접속·조작 기록, 위험 명령 재인증(비밀번호·PIN, 방식 미정 ⚠ B2). 앱의 명령 전송에는 재인증을 끼울 자리만 있다.

#### 권한 표

로그인한 사람이 무엇을 할 수 있는지의 기준표다. 역할별 권한은 ⚠ 가정이다(A4, A13). 명령별 필요 권한은 `shared/src/commands.ts`의 `COMMAND_RULES`, 역할별 권한은 모의 서버 `fixtures/accounts.ts`.
이 표의 줄·✓✗는 테스트가 코드와 비교한다(`app/src/test/permissionMatrix.ts`: 화면·api 클라이언트는 `permissionMatrix.test.tsx`, 서버는 `permissions.integration.test.ts`가 실제 HTTP로). 표를 바꾸면 그 표도 함께 바꾼다.

| 동작 | 필요 권한 | 관리자 admin | 작업자 operator | 열람자 viewer | 화면 (권한이 없을 때) | 서버 (권한이 없을 때) |
| --- | --- | --- | --- | --- | --- | --- |
| 3D 홈 보기 (장면·지표·표·상세 패널) | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 대시보드 홈 보기 (KPI 상세 팝업 포함) | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 섹터·로봇팔·컨베이어·압축기 페이지 보기 | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 공정 기록과 기록 상세 팝업 보기 | 로그인 | ✓ | ✓ | ✓ | – (팝업에는 조작이 없다) | 로그인 안 하면 401 |
| 배치·베일 화면 보기 | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 알람 보기 (열린 알람·이력) | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| CCTV 보기 | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 설정 화면 (화질·계정) | 로그인 | ✓ | ✓ | ✓ | – | 로그인 안 하면 401 |
| 로봇 진단 (관절 각도 표) | `robot.manual` (표시 구분) | ✓ | ✗ 숨김 | ✗ 숨김 | 로봇팔 자세히에서 숨김 | 막지 않음: 관절 값은 모든 역할에게 온다 ⚠ A13 |
| 시작·일시정지·재개·정지 | `robot.control` | ✓ | ✓ | ✗ 숨김 | 3D 홈 상세 패널·기기 페이지 조작 줄에서 숨김 | 403 |
| 알람 확인 | `alarm.ack` | ✓ | ✓ | ✗ 숨김 | 대시보드 홈·알람 화면·기기 페이지 조작 줄에서 숨김 | 403 |
| 설정값 변경 | `settings.write` | ✓ | ✗ 비활성 | ✗ 비활성 | 네 기기 페이지 자세히: 입력·버튼 비활성 + "설정을 바꿀 권한이 없습니다." | 403 |
| 로봇 운전 모드 전환 (자동·수동) | `robot.manual` | ✓ | ✗ 비활성 | ✗ 숨김 | 로봇팔 페이지: 작업자는 "적용" 비활성 + "적용: 권한이 없습니다", 열람자는 카드 없음. 3D 홈 로봇 패널: 숨김 | 403 |
| 로봇 섹터 지정 (자동 · 섹터 지정) | `robot.manual` | ✓ | ✗ 비활성 | ✗ 숨김 | 위와 같다 | 403 |
| 로봇 수동 집기 | `robot.manual` | ✓ | ✗ 비활성 | ✗ 숨김 | 로봇팔 페이지: 작업자는 "집기" 비활성 + "집기·놓기: 권한이 없습니다", 열람자는 카드 없음. 3D 홈 로봇 패널: 숨김 | 403 |
| 로봇 컨베이어에 놓기 | `robot.manual` | ✓ | ✗ 비활성 | ✗ 숨김 | 위와 같다 | 403 |
| 배치 배합 변경 | `batch.control` | ✓ | ✗ 비활성 | ✗ 비활성 | 배치·베일 화면 수동 제어: 입력·버튼 비활성 + "배치 수동 제어 권한이 없습니다." | 403 |
| 배치 목표 압력 변경 | `batch.control` | ✓ | ✗ 비활성 | ✗ 비활성 | 위와 같다 | 403 |
| 배치 일시정지·재개 | `batch.control` | ✓ | ✗ 비활성 | ✗ 비활성 | 위와 같다 | 403 |
| 배치 건너뛰기 | `batch.control` | ✓ | ✗ 비활성 | ✗ 비활성 | 위와 같다 | 403 |

- **세 층:** ① 화면은 위 표대로 숨기거나 비활성 + 이유. 편의일 뿐 차단 수단이 아니다. ② api 클라이언트는 `/me`의 권한에 필요 권한이 없으면 명령 요청을 보내지 않고 403(`PERMISSION_MISSING`, 앱 안에서만 쓰는 코드)으로 거부해 "거부됨"을 보인다. ③ 서버는 요청마다 다시 검사해 403 `FORBIDDEN`. 서버의 판단 순서: 명령 종류·대상(422) → 권한(403) → 값 검증·확인 단계(422) → 현재 상태(409).
- 조회 API는 권한 없이 로그인만 본다(모든 역할 200, 로그인하지 않으면 401). 역할별 조회 제한은 ⚠ B36.
- 주 메뉴는 권한으로 가르지 않는다. 메뉴 설정(`config/navigation.ts`의 `requires`)으로 숨기거나 비활성할 수 있게만 해 두었다.
- 명령 결과 조회 `GET /commands/{id}`는 명령을 보낸 사람만(다른 사람이면 역할과 상관없이 403) ⚠ B39.
- 권한이 바뀌면 앱은 다음 `/me`(로그인·자동 로그인·새로고침) 때 반영한다. 그 사이 옛 권한으로 보인 버튼은 서버가 403으로 막는다 ⚠ B38.

### 조회

| 메서드와 경로 | 설명 | 응답 |
| --- | --- | --- |
| GET `/plant/summary` | 상단 지표용 요약 ⚠ B11·B27 | `{averageMoisturePercent, totalFillPercent, balesToday, compressorUptimePercent, status, updatedAt}` |
| GET `/plant/history?metric=&from=&to=&interval=` | 요약 값의 이력(지표 추이선). `metric`: `balesToday`, `averageMoisturePercent`, `compressorUptimePercent` | `{metric, interval, from, to, points:[{ts,value}]}` |
| GET `/plant/kpi-history?metric=&range=&timeZone=` | KPI 상세 ⚠. `range`: `today`(현지 자정부터 시간별) · `7d` · `30d`(오늘 포함 일별). `timeZone`은 IANA 이름(빼면 `Asia/Seoul`). 잘못되면 422 | `{metric, range, from, to, interval:'1h'\|'1d', points:[{ts,value,runningMinutes?,stoppedMinutes?}], statistics:{current,average,min,max}, targetBand:{min,max}\|null, updatedAt}`. 생산량은 구간 생산 개수, 통계·목표 범위·가동/정지 분은 서버 집계 |
| GET `/devices` | 기기 목록과 현재 상태 | 기기 상태 배열 |
| GET `/devices/{id}/state` | 기기 하나의 최신 상태 | 아래 "기기 상태" |
| GET `/devices/{id}/history?metric=&from=&to=&interval=` | 이력 시계열 ⚠ B12. `metric`: 섹터 `level`·`moisture`·`volume`, 컨베이어 `load`, 압축기 `pressure`·`temperature`(로봇 없음). `interval`은 `10m`·`1h`·`1d` 꼴, 점 1000개까지 | `{deviceId, metric, interval, from, to, points:[{ts,value}]}` |
| GET `/devices/{tank-…}/unloads/records` | 섹터 하나의 하역 기록(섹터 ID만) | 기록 목록 |
| GET `/robots/{id}/model` | 로봇 모델 ⚠ B13 | `{deviceId, axisCount, joints:[{name,minDeg,maxDeg,zeroDeg}], linkLengthsM}` |
| GET `/robots/robot-1/picks/records` | 로봇 집기 기록 | 기록 목록 |
| GET `/process/state` | 공정 흐름 현재 상태(진행 중 + 종류별 최근 20건). 재연결 때 한 번 | `{vehicles, batches, bales, updatedAt}` |
| GET `/vehicles/records`, GET `/vehicles/{id}` | 차량 기록 목록·한 건(없으면 404) | 기록 목록 / `VehicleRecord` |
| GET `/batches/records`, GET `/batches/{id}` | 배치 기록 목록·한 건(없으면 404) | 기록 목록 / `BatchRecord` |
| GET `/bales/records`, GET `/bales/{id}` | 베일 기록 목록·한 건(없으면 404) | 기록 목록 / `BaleDetail` |
| GET `/batches/control` | 배치 수동 제어 상태 ⚠ | 아래 "배치·베일 제어" |
| GET `/batches/events/records` | 배치·베일 사건 기록 | 기록 목록 |
| GET `/alarms?state=&from=&to=&q=` | 알람 목록·이력(모두 선택). `state`: `active`·`acknowledged`·`cleared`. 기간 `[from, to)`와 `q`를 함께 적용. 최신순 배열, 쪽 나누기 없음 | `Alarm[]` |
| GET `/cameras`, GET `/cameras/{id}/stream`, GET `/cameras/{id}/snapshot` | CCTV(아래 "CCTV") | |
| GET `/commands/{commandId}` | 명령 결과 조회(WebSocket을 못 받았을 때). 보낸 사람만 | `{commandId, status, reason}` |

#### 기록 목록 (페이지 나누기)

지난 기록을 보는 모든 목록(하역·집기·차량·배치·베일·배치 사건)은 같은 요청·응답 모양이다 ⚠ B29.

```
GET .../records?from=2026-10-15T00:00:00.000Z&to=2026-10-15T05:30:00.000Z&page=1&pageSize=10&q=12가
```

| 쿼리 | 설명 |
| --- | --- |
| `from`, `to` | 구간 `[from, to)`, ISO 8601 UTC, `from < to`. 화면은 현지 날짜(오늘·어제·최근 7일·직접 선택)를 UTC로 바꿔 보낸다 |
| `page` | 1부터 |
| `pageSize` | 1~100. 화면은 10 |
| `q` | (선택) 검색어, 64자 이하. 기간과 **함께** 적용: 결과 = 그 기간의 기록 중 검색어에 맞는 것. 없거나 빈 문자열이면 거르지 않는다 |

```json
{ "items": [ ... ], "total": 23, "page": 1, "pageSize": 10 }
```

- `items`는 최신 먼저(기록 시각 내림차순), `total`은 기간과 검색어를 모두 적용한 건수. 쪽 수는 `ceil(total / pageSize)`.
- 전체 쪽 수보다 큰 `page`는 빈 `items`(오류 아님). 빠진 쿼리, `from >= to`, 범위 밖 `page`·`pageSize`, 64자 넘는 `q`는 422.
- 검색은 서버가 한다: 대소문자 무시, 부분 일치, **공백은 검색어와 값 양쪽에서 모두 무시**("12가3456"이 "12가 3456"을 찾는다). 규칙은 `shared/src/search.ts`.

| 기록 | 기록 시각 | 검색 대상(`q`) |
| --- | --- | --- |
| 섹터 하역 `/devices/{id}/unloads/records` | `unloadedAt` | 번호판, 회사 |
| 로봇 집기 `/robots/robot-1/picks/records` | `pickedAt` | 섹터(`tank-a1`·`A1`·`섹터 A1`), 배치 ID |
| 차량 `/vehicles/records` | `arrivedAt` | 번호판, 회사 |
| 배치 `/batches/records` | `startedAt` | 배치 ID, 배합 섹터 |
| 베일 `/bales/records` | `createdAt` | 베일 ID, 배치 ID |
| 배치·베일 사건 `/batches/events/records` | `at` | 배치 ID, 베일 ID, 사건 종류 이름(배치 생성·배합 변경·압력 변경·일시정지·재개·건너뜀·베일 생산·섹터 지정·섹터 지정 변경·섹터 지정 해제), 수행자 |
| 알람 `GET /alarms` (쪽 없음) | `ts` | 기기 이름(`tank-a1`·`섹터 A1`·`압축기` …), 알람 메시지 |

#### 공정 기록

기록 한 줄의 모양이다. 진행 중인 차량·배치와 적치 중인 베일도 목록에 들어 있고, 끝나면 같은 줄이 바뀐다. 지난 30일치를 준다 ⚠ B30·B31.

```json
// 섹터 하역: 하역하고 출차 계량을 마치면 한 줄
{ "id": "unl-20261015-034", "vehicleId": "veh-20261015-034", "sectorId": "tank-a1",
  "plate": "12가 3456", "companyName": "한빛자원", "unloadedAt": "2026-10-15T04:12:40.000Z",
  "grossT": 18.42, "tareT": 9.86, "netT": 8.56, "fillBeforePercent": 42.0, "fillAfterPercent": 55.1 }

// 차량 (GET /vehicles/{id}도 같은 모양)
{ "id": "veh-20261015-034", "status": "departed",
  "plate": "12가 3456", "companyName": "한빛자원", "sectorId": "tank-a1",
  "arrivedAt": "...", "departedAt": "...", "grossT": 18.42, "tareT": 9.86, "netT": 8.56,
  "stageTimes": { "arrived": "...", "identified": "...", "unloading": "...", "unloaded": "...", "departed": "..." } }

// 배치 (GET /batches/{id}도 같은 모양)
{ "id": "batch-0407", "result": "completed", "startedAt": "...", "endedAt": "...",
  "mix": [{ "sectorId": "tank-a1", "percent": 40 }, { "sectorId": "tank-b2", "percent": 60 }],
  "actualMix": null, "pinChanges": [],
  "avgMoisturePercent": 11.8, "targetPressureMpa": 28.5, "actualPressureMpa": 28.3,
  "balesProduced": 1, "baleIds": ["BL-20261015-0407"] }

// 베일 (목록 한 줄)
{ "id": "BL-20261015-0407", "batchId": "batch-0407", "stage": "shipped",
  "createdAt": "...", "shippedAt": "...", "pressureMpa": 28.3, "avgMoisturePercent": 11.8 }

// 로봇 집기: 컨베이어에 놓은 것만 한 줄
{ "id": "pick-…", "pickedAt": "...", "grabbedAt": "...", "grabbedBy": null, "placedBy": null,
  "mode": "auto", "sectorId": "tank-a1", "volumeM3": 0.42, "conveyorId": "conveyor-z", "batchId": "batch-0407" }
```

- 하역: 무게는 계중대 값(t), `netT = grossT − tareT`(서버 계산). `fillBeforePercent`·`fillAfterPercent`는 하역 직전·직후 섹터 적재율, 화면은 두 값과 차이(%p)만 적는다.
- 차량 `status`: `identified`(계중대 도착·번호판 인식), `unloading`(하역 중·하역 완료), `departed`(출차). 번호판·회사·배정 섹터는 인식 전 `null`. `grossT`는 처음부터, `tareT`·`netT`·`departedAt`은 출차 계량 뒤에야 있다(그 전 `null`).
- 배치 `result`: `completed`(완료), `skipped`(건너뜀: 압축하지 않고 넘어감), `paused`(일시정지된 채 끝남), 진행 중이면 `null`. `actualPressureMpa`는 압축 때 낸 압력(압축 전·건너뜀은 `null`), `endedAt`은 진행 중이면 `null`, `balesProduced = baleIds.length`. `actualMix`·`pinChanges`는 아래 "로봇팔 7단위".
- 베일 `stage`: `created`(적치), `shipped`(출하, 그 전 `shippedAt` `null`). 압력·수분은 생산 당시 스냅샷. `GET /bales/{id}`는 여기에 `stageTimes`, `updatedAt`, 생산 당시 배합 `mix`(실제 배합이 있으면 실제 배합)를 더한 `BaleDetail`.
- 집기: `pickedAt`은 놓기 완료 시각(기록 시각), `grabbedAt`은 집은 시각, `grabbedBy`·`placedBy`는 수동으로 조작한 사람(자동은 `null`), `mode`는 사이클 시작 당시 모드, `batchId`는 사이클 시작 때의 배합 중 배치(없으면 `null`, 도중에 건너뛴 배치를 다른 배치로 돌리지 않는다).

#### 기기 상태

`status`는 `normal`·`caution`·`alarm`·`offline` 중 하나이고 서버가 기준값으로 정한다. 기기 상태에는 무게가 없다.

```json
// 섹터: GET /devices/tank-a1/state
{ "id": "tank-a1", "type": "tank", "section": "A1", "grade": "A", "status": "normal",
  "fillPercent": 72.4, "volumeM3": 5.8, "capacityM3": 8.0, "cautionThresholdPercent": 80,
  "moisturePercent": 11.8, "updatedAt": "2026-10-13T05:23:11.250Z" }

// 로봇팔: GET /devices/robot-1/state
{ "id": "robot-1", "type": "robot", "status": "running", "mode": "auto",
  "pinnedSectors": [], "pickRecordsRevision": 12,
  "phase": "move", "targetTankId": "tank-a1", "heldSectorId": null,
  "gripper": { "closed": true, "holding": true }, "updatedAt": "..." }

// 컨베이어: GET /devices/conveyor-z/state
{ "id": "conveyor-z", "type": "conveyor", "status": "normal", "running": true, "loadPercent": 40, "itemsToBaler": 2, "updatedAt": "..." }

// 압축기: GET /devices/compressor-1/state
{ "id": "compressor-1", "type": "compressor", "status": "normal", "running": true, "pressureMpa": 28.7, "temperatureC": 42.3, "cycleStage": "pressing", "updatedAt": "..." }
```

- 섹터: `grade`는 `A`·`C` ⚠ A8. `cautionThresholdPercent`는 지금 적용 중인 주의 기준 적재율(설정 `cautionThresholdPercent`의 현재값)이고 서버는 이 값으로 `status`를 판정한다. 화면은 주의선으로 그리기만 한다.
- 로봇: `status`는 `idle`·`running`·`paused`·`stopped`·`error`·`offline`(기기 `status`와 다른 목록). `mode`는 `auto`·`manual`·`auto_pinned`. `phase`는 `idle`·`pick`·`move`·`place`. `targetTankId`는 작업 중인 섹터(아니면 `null`), `heldSectorId`·`pinnedSectors`·`pickRecordsRevision`은 "로봇팔 7단위".
- 컨베이어 `itemsToBaler`: 로봇이 벨트에 놓았지만 아직 압축기에 닿지 않은 덩어리 수(개). 압축기 `cycleStage`: `idle`·`filling`(배합 중인 배치를 받는 중)·`pressing`·`ejecting`(결속·배출) ⚠ B32.

#### 배치·베일 제어 (5단위)

`GET /batches/control` (화면은 2초마다, 명령 결과와 재연결 때 다시 조회):

```json
{ "eventsRevision": 31, "pressureRange": { "min": 27.0, "max": 30.0 },
  "current": { "batch": { ...Batch }, "paused": false, "skipped": false, "progressPercent": 45, "currentPressureMpa": 0, "baleIds": [] },
  "next": { ... } }
```

- `current`·`next`의 선정, 진행률, 압력, 허용 압력 범위는 서버가 정한다. `eventsRevision`이 바뀌면 사건 기록을 같은 기간·쪽으로 다시 받는다.
- 사건(`BatchEvent`): `{id, batchId, at, type, actor, detail, baleId?}`. `type`: `created`, `mix_changed`, `pressure_changed`, `paused`, `resumed`, `skipped`, `bale_produced`, `pin_started`, `pin_changed`, `pin_ended`. `detail`에 변경 전후·사유·섹터 목록을 적는다.
- 명령은 아래 "명령"의 배치 명령. 화면은 서버가 확정하기 전에는 표시값을 바꾸지 않는다(초안 입력과 서버 확정값을 나눠 보여 준다).

### 실시간 스트림 (WebSocket)

`POST /auth/ws-ticket`으로 티켓을 받아 `wss://{server}/ws/v1/stream?ticket={ticket}`에 연결하고 주제를 구독한다(브라우저 WebSocket은 헤더를 못 보내고 토큰을 주소에 넣지 않으므로 1회용 티켓). 세션이 폐기되면 서버가 연결을 닫는다.

```json
// 클라이언트 -> 서버
{ "type": "subscribe", "topics": ["plant", "devices", "alarms", "process", "robot-1.joints"] }
{ "type": "unsubscribe", "topics": ["robot-1.joints"] }
```

`robot-1.joints`는 양이 많아 3D 홈과 로봇팔 페이지에 있는 동안만 구독한다. 주제별 권한은 없다 ⚠ B37.

| 서버 -> 클라이언트 | 주제 | 보내는 시점 | 내용 |
| --- | --- | --- | --- |
| `plant.summary` | `plant` | 변할 때, 최소 5초마다 | `{type, summary}` (`/plant/summary`와 같은 모양) ⚠ B11 |
| `device.state` | `devices` | 변할 때, 최소 5초마다 | `{type, state}` (기기 상태와 같은 모양) ⚠ B14 |
| `robot.joints` | `robot-1.joints` | 초당 10~20회 | `{type, deviceId, seq, ts, joints[], gripper, phase, targetTankId}`. 관절 순서·단위는 `/robots/{id}/model` |
| `alarm` | `alarms` | 발생·확인·해제 | `{type, alarm}` |
| `process.vehicle` · `process.batch` · `process.bale` | `process` | 대상의 `stage`나 값이 바뀔 때 | 대상 하나의 전체 상태(아래 "공정 흐름") |
| `command.result` | (구독 없이) | 명령 결과가 나왔을 때 | `{type, commandId, status, reason}`. 연결된 모두에게 가고 앱은 자기가 보낸 `commandId`만 표시 ⚠ B19 |
| `heartbeat` | (구독 없이) | 5초마다 | `{type, ts}` ⚠ B14 |

```json
{ "type": "robot.joints", "deviceId": "robot-1", "seq": 1204, "ts": "2026-10-13T05:23:11.250Z",
  "joints": [12.5, -45.0, 80.2, 0.0, 35.7, 90.0], "gripper": { "closed": true, "holding": true },
  "phase": "move", "targetTankId": "tank-a1" }

{ "type": "alarm", "alarm": { "id": "al-3301", "level": "caution", "deviceId": "tank-a2",
  "message": "적재율 80% 초과", "state": "active", "ts": "2026-10-13T05:23:11.250Z" } }
```

- 알람 `level`: `caution`·`alarm`, `state`: `active`·`acknowledged`·`cleared` ⚠ B17.
- 15초 동안 아무 메시지도 받지 못하면 연결 끊김(3절 "연결 끊김"). 복구되면 REST로 다시 받는다. "연결됨"은 첫 메시지를 받았을 때 켠다.

### 명령

명령은 정해진 종류(`type`)로 보내고, 실행 가능 여부와 권한은 서버가 매번 다시 검사한다.

| 메서드와 경로 | 설명 |
| --- | --- |
| POST `/devices/{id}/commands` | 기기에 명령. 헤더 `Idempotency-Key` 필수(같은 사람의 같은 키 재전송은 처음 응답 그대로, 같은 키로 다른 본문은 422) |
| GET `/commands/{commandId}` | 결과 조회(보낸 사람만) |

| 명령 `type` | 대상 기기 | 위험도 | 필요 권한 | 추가 필드 |
| --- | --- | --- | --- | --- |
| `start`, `pause`, `resume`, `stop` | 로봇·컨베이어·압축기 | 낮음(홈 가능) | `robot.control` | 없음 |
| `ack_alarm` | 그 알람의 `deviceId` 경로 ⚠ B16 | 낮음 | `alarm.ack` | `alarmId` |
| `set_mode` | 로봇 | 높음 | `robot.manual` | `mode`: `auto`·`manual`·`auto_pinned`. `auto_pinned`만 `pinnedSectors`(중복 없는 섹터 1~4개), `confirm: true` |
| `pick_from` | 로봇 | 높음 | `robot.manual` | `tankId`, `confirm: true` |
| `place_on_conveyor` | 로봇 | 높음 | `robot.manual` | `confirm: true` |
| `update_setting` | 모든 기기 | 높음(기기 페이지만) | `settings.write` | `key`, `value`, `confirm: true`. 키와 범위 ⚠ B17·B18: 섹터 `cautionThresholdPercent` 1~94 %, 로봇·컨베이어 `speedPercent` 10~100 %, 압축기 `pressureLimitMpa` 10~40 MPa |
| `set_batch_mix` | 압축기 | 높음(배치·베일 화면만) | `batch.control` | `batchId`, `mix:[{sectorId,percent}]`(합 100), `confirm: true` |
| `set_batch_pressure` | 압축기 | 높음 | `batch.control` | `batchId`, `targetPressureMpa`(허용 범위 안), `confirm: true` |
| `pause_batch`, `resume_batch` | 압축기 | 높음 | `batch.control` | `batchId`, `confirm: true` |
| `skip_batch` | 압축기 | 높음 | `batch.control` | `batchId`, `reason`(공백 제외 1~120자), `confirm: true` |

```json
// 요청: POST /devices/robot-1/commands  (Idempotency-Key: 4f1c…)
{ "type": "pick_from", "tankId": "tank-a1", "confirm": true }

// 응답 202: 접수되었을 뿐 완료가 아니다
{ "commandId": "cmd-8841", "status": "accepted" }

// WebSocket command.result (또는 GET /commands/cmd-8841)
{ "type": "command.result", "commandId": "cmd-8841", "status": "completed", "reason": null }
```

- `status`: `accepted`, `rejected`, `completed`, `failed`. `rejected`·`failed`에는 `reason`. 화면은 WebSocket 결과를 5초 기다리고, 안 오면 2초마다 조회하다 60초 뒤 "결과 확인 불가"로 둔다.
- 서버 판단 순서: 종류·대상(422) → 권한(403) → 본문·`confirm`(422) → 접수 시점 상태(409) → 202. 실행 때(0.6~1.2초 뒤) 상태를 다시 보고 어긋나면 `rejected`.
- 409 예: 이미 작동 중인데 `start`, 작동 중이 아닌데 `pause`, 일시정지가 아닌데 `resume`, 이미 정지인데 `stop`, 로봇 오류·연결 끊김, 이미 확인한 알람, 아래 로봇 순서 위반.
- 배치 명령의 거부(`rejected`): 배치가 끝났거나 단계가 바뀜, 배합 합계 오류, 압력 범위 밖, 이미 일시정지·재개 상태. 배합은 투입 전, 압력은 압축 전까지만 바꿀 수 있고 압축 중에는 건너뛸 수 없다. `batch.control`은 관리자만 갖는 가정이다 ⚠ A15.
- 화면은 위험도 높은 명령을 확인 단계 없이 보내지 않고(`confirm: true`), 권한이 없으면 보내지 않는다(6절 "권한 표").
- "비상정지" 명령은 없다. `stop`은 일반 정지이며 안전 장치가 아니다.

#### 로봇팔 운전 모드 (로봇팔 6단위·로봇팔 7단위)

- **모드.** `auto`는 배치 계획(배합 순서)을 따라 집는다. `manual`은 사람이 한 번에 한 사이클을 두 조작으로 나눠 한다. `auto_pinned`("자동 · 섹터 지정")는 배합 순서 대신 지정한 섹터만 순환하고, 배합할 배치가 없거나 일시정지면 기다리며 빈 섹터는 건너뛴다. 같은 지정 모드에서 섹터만 바꿀 수 있고, `auto`·`manual`로 바꾸면 지정이 풀린다(`pinnedSectors: []`). 진행 중인 사이클은 시작 당시 모드·섹터로 마친다.
- **수동 두 단계.** `pick_from {tankId}`: 섹터에서 집어 들고 그 위에서 멈춘다(완료 = 집어 든 때, 빈 섹터면 `failed`). `place_on_conveyor`: 집어 든 파지를 컨베이어에 놓는다(완료 = 놓은 때, 이때 집기 기록 한 줄). 로봇 상태 `heldSectorId`가 집어 든 섹터이고, 수동 모드에서 `phase: idle` + `heldSectorId`면 "놓기 대기".
- **순서는 서버가 지킨다(409).** 들고 있는데 `pick_from`, 들고 있지 않은데 `place_on_conveyor`, 작업 중(`phase ≠ idle`), 수동 모드가 아님, 작동 중이 아님, 수동으로 들고 있는 동안 `set_mode`("먼저 컨베이어에 놓으세요"). `stop`은 들고 있는 것을 놓지 않는다(그리퍼는 닫힌 채). 자동 모드에서 들고 있으면 다음 사이클은 놓기부터 한다.
- **실제 배합.** `auto_pinned`로 집는 동안 배치는 계획과 다르게 채워진다. 서버는 배합 중인 배치(`stage: mixing`)에 지정을 걸고 실제로 놓은 부피로 실제 배합을 계산해 배치(`Batch`, `process.batch`, `/batches/control`)와 배치 기록(`BatchRecord`)에 싣는다 ⚠ B33.
  - `actualMix: MixPart[] | null`: 지정이 한 번이라도 걸린 배치에서 지금까지 놓은 부피 비율(%, 합 100, 아직 없으면 `[]`). 지정이 걸린 적 없는 배치는 `null`(계획대로).
  - `pinning: {sectors, since, actor} | null`: 지금 걸린 지정. 배합이 끝나면 `null`. `pinChanges: [{at, actor, sectors}]`: 지정 시작·변경·해제 기록(해제는 `sectors: []`).
  - 지정 중에 새 배치가 배합을 시작하면 같은 지정이 그 배치에도 걸린다. 지정이 끝나면 남은 집기는 계획 배합비를 따르고, 지정 중에 놓은 몫을 메우려고 계획을 바꾸지 않는다.
  - `avgMoisturePercent`·`targetPressureMpa`는 실제 배합으로 서버가 다시 계산한다(사람이 `set_batch_pressure`로 정한 목표 압력은 그대로). 사건 `pin_started`·`pin_changed`·`pin_ended`가 남는다.
- **집기 기록 갱신.** 로봇 상태의 `pickRecordsRevision`이 바뀌면 화면은 집기 기록을 같은 기간·쪽으로 다시 받는다.
- **3D 홈 로봇 패널**은 로봇팔 페이지와 같은 운전 모드 조작(같은 컴포넌트·권한·확인 단계·결과 표시)을 둔다. 다른 위험 조작(설정 변경, 배치 제어)은 기기 페이지·배치·베일 화면에서만이다(이유: `decisions.md` 2026-10-16 "수동 집기·놓기 두 단계").

### 알림과 알람

| 메서드와 경로 | 설명 |
| --- | --- |
| POST `/push/register` | 안드로이드 FCM 토큰 등록 `{"fcmToken","platform":"android"}` (모의 서버 미구현, 앱 빌드 단계에서) |
| DELETE `/push/register` | 로그아웃 때 등록 해제 (모의 서버 미구현) |
| GET `/alarms?state=&from=&to=&q=` | 알람 목록과 이력(6절 "조회") |

앱이 켜져 있으면 WebSocket `alarm`, 닫혀 있으면 서버가 FCM으로 보낸다. 푸시는 지연·누락될 수 있어 안전과 직결된 알림을 이것에만 의존하지 않는다. 알람 확인은 `ack_alarm` 명령이다.

### CCTV

| 메서드와 경로 | 설명 |
| --- | --- |
| GET `/cameras` | 카메라 목록 `[{"id","name","location"}]` |
| GET `/cameras/{id}/stream` | 재생 주소 `{"protocol":"hls"\|"webrtc","url","expiresAt"}`. 만료되는 서명 주소이며 로그인한 사용자에게만 발급. 만료되면 다시 받는다 |
| GET `/cameras/{id}/snapshot` | 현재 정지 화면(JPEG). 이미지라 토큰을 주소에 넣지 않고 인증 헤더로 받아 Blob으로 그린다(모의 서버 미구현, 503) |

영상 변환은 서버 몫이고 앱은 받은 주소를 재생만 한다. 로봇 조작과 함께 볼 때는 지연이 짧은 WebRTC, HLS는 수 초 지연이 있어 참고용이다. 모의 서버는 공개 HLS 시험 영상을 준다.

### 공정 흐름

3D 홈과 대시보드의 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하를 움직이는 값이다 ⚠ B23~B27.

1. 번호판 → 회사, 회사 → 섹터 배정, 섹터 등급·수분, 배합비, 압축 압력은 모두 서버가 정한다. 앱에는 이 값을 정하는 로직이 없다.
2. 사건만 흘리지 않고 **대상 전체 상태를 `stage`와 함께** 보낸다(`device.state`와 같은 방식). 메시지 하나를 놓쳐도 다음 메시지나 `GET /process/state`로 맞춰진다(이유: `decisions.md` 2026-10-13 "공정 흐름 형식").
3. 공정 흐름 메시지에는 무게가 없다(무게는 차량·하역 기록).

```json
// process.vehicle — stage: arrived(계중대 도착) → identified → unloading → unloaded → departed
{ "type": "process.vehicle", "vehicle": {
    "id": "veh-20261013-031", "stage": "identified",
    "plate": "12가 3456", "companyName": "한빛자원", "sectorId": "tank-a1",
    "stageTimes": { "arrived": "...", "identified": "..." }, "updatedAt": "..." } }

// process.batch — stage: planned → mixing → compressing → completed
{ "type": "process.batch", "batch": {
    "id": "batch-0412", "stage": "compressing",
    "mix": [ { "sectorId": "tank-a1", "percent": 40 }, { "sectorId": "tank-b2", "percent": 60 } ],
    "actualMix": null, "pinning": null, "pinChanges": [],
    "avgMoisturePercent": 11.8, "targetPressureMpa": 28.5,
    "stageTimes": { "planned": "...", "mixing": "...", "compressing": "..." }, "updatedAt": "..." } }

// process.bale — stage: created(결속 후 배출) → shipped
{ "type": "process.bale", "bale": { "id": "BL-20261013-0412", "batchId": "batch-0412", "stage": "created",
    "stageTimes": { "created": "..." }, "updatedAt": "..." } }

// GET /process/state
{ "vehicles": [ ... ], "batches": [ ... ], "bales": [ ... ], "updatedAt": "..." }
```

- `plate`·`companyName`·`sectorId`는 `arrived`에서는 `null`, `identified`부터 채워진다. `sectorId`는 섹터 기기 ID.
- `targetPressureMpa`는 서버가 이 배치에 정한 목표 압력, 실제 압력은 압축기 상태의 `pressureMpa`.
- 로봇이 어느 섹터에서 집는지는 `robot.joints`·로봇 상태의 `targetTankId`를 따른다. 화면이 배합비로 집는 순서를 계산하지 않는다.
- 사건 이름과의 대응: `vehicle.arrived`/`identified` → 차량 `arrived`/`identified`, `unload.started`/`completed` → `unloading`/`unloaded`(출차 `departed`), `batch.planned` → `planned`(배합 시작 `mixing`), `compress.started`/`completed` → `compressing`/`completed`, `bale.created`/`shipped` → 베일 `created`/`shipped`.
- 값이 모의 서버나 시연 원본에서 오는 동안 화면에 "예시 데이터"를 표시한다.

## 확인 상태와 프로토타입 가정

아직 답을 받지 않은 질문은 모두 `docs/questions.md`에 있다(대표님 A, 서버 담당 B). 답을 받으면 그 문서에 적고, 사용자가 "확인됐다"고 한 것만 1절 확정 사항 표로 옮긴다.

확인된 것(1절에 반영): 현장 밖 접속 필요(로그인으로 보호), 자동 운전은 서버·대시보드는 수동 조작, 태블릿 기종 제한 없음·사용자 소수.

### 프로토타입 가정

답이 오기 전까지 아래 가정으로 만들었다. 가정이 바뀌면 오른쪽 열만 고친다. 프로토타입을 보낼 때 이 표를 함께 전달한다.

| 항목 | 현재 가정 | 바뀔 때 고칠 곳 |
| --- | --- | --- |
| 서버 | 이 문서의 API를 따르는 서버가 생긴다. 그 전에는 모의 서버 | API 경로와 값 형식(`shared/`) |
| 권한 | `admin`(5개 전부), `operator`(`robot.control`, `alarm.ack`), `viewer`(없음). 6절 "권한 표" | 모의 서버 `fixtures/accounts.ts`, `app/src/test/permissionMatrix.ts`, 6절 권한 표, `config/controls.ts`·`navigation.ts` |
| 수동 조작 | 시작·일시정지·재개·정지, 알람 확인, 설정 변경, 로봇 모드 전환(섹터 지정 포함), 수동 집기·놓기(두 단계), 배치 배합·압력·일시정지·재개·건너뛰기 | `shared/commands.ts`, `config/controls.ts` |
| 로봇 기종 | 범용 6축, 링크 길이·축은 설정값, 각도 단위 도 | `config/robotModel.ts`, 구조가 크게 다르면 `studio/actors/Robot` |
| 이상 기준 | 적재율 80% 이상이 주의, 서버가 `status`로 판정 | 서버 설정(화면은 `status`와 `cautionThresholdPercent`만 표시) |
| 장면 구성 | 게이트·계중대, 섹터 4개, 로봇팔 1개, 긴 컨베이어 1개(Section Z), 압축기 1개, 출하 마당 | `studio/world/layout.ts` |
| 태블릿·화질 | 기종 제한 없음, 화질 3단계 자동 선택, `low`가 저사양 안전판 | `studio/quality.ts`, `config/quality.ts` |
| 접속 | 현장 밖 포함, 로그인으로 보호 | 서버 보안 설정, VPN 병행 여부 |
| 자동 로그인 | 웹 HttpOnly 쿠키, 안드로이드 보안 저장소. 자동 로그인 14일, 아니면 브라우저·앱을 닫을 때까지. 재사용 유예 30초 | `shared/auth.ts`, `app/src/api/tokens.ts`, 모의 서버 `auth.ts` |
| 카메라 | 1대 이상, HLS 우선 | CCTV 방식 |
| 알림 | 켜져 있으면 WebSocket, 닫혀 있으면 FCM | 서버가 FCM을 못 보내면 켜져 있을 때만 |
| 수납 섹터·등급 | A1·A2·B1·B2(기존 탱크와 같은 대상, ID 그대로), 등급 A·C | 기기 ID 목록, 장면 배치, `shared/devices.ts` |
| 계중대와 무게 | 차량·하역 기록에만 계중대 t(총중량·공차·순중량 셋 다), 섹터는 적재율·부피, 집기는 부피 | `shared/records.ts`·`processRecords.ts`, `config/display.ts` |
| 기록 목록 | `from`·`to`·`page`·`pageSize`·`q`와 `{items,total,page,pageSize}`, 한 쪽 10줄, 지난 30일 | `shared/records.ts`, 모의 서버 `routes/records.ts`, `components/records` |
| 차량·회사·섹터 배정 | 서버가 정한다. 모의 서버는 가상의 회사(한빛자원, 동해페이퍼, 새솔리싸이클)와 번호판 | 모의 서버 예시 데이터 |
| 배합과 압력 | 배치별 배합비·평균 수분·목표 압력은 서버가 정한다 | 모의 서버 `sim/process.ts` |
| 배치·베일 | 배치당 베일 1개(모델 1→N), `batch.control` 관리자만, 투입 전 배합·압축 전 압력만 변경, 압축 중 건너뛰기 거부 | `shared/commands.ts`, 모의 서버 `fixtures/accounts.ts`·`sim/process.ts` |
| 로봇 운전 모드 | 섹터 지정의 실제 배합, 수동 집기·놓기 두 단계(6절 "로봇팔 7단위") | `shared/process.ts`·`devices.ts`·`robot.ts`, 모의 서버 `sim/robot.ts`·`sim/commands.ts` |
| 출하 마당 연출 | 고정 칸(8열×3단), 지게차 1~2대, 칸이 차면 압축기 대기 | `config/yard.ts` |

## 위험과 대응

가장 큰 위험은 서버 담당과 일정이 정해지지 않은 것이고, 다음은 실제 태블릿의 3D 성능과 화면이 실제 로봇과 어긋나는 문제다.

| 위험 | 대응 |
| --- | --- |
| 서버 담당·일정 불명확 | 질문을 `questions.md`로 관리하고 모의 서버로 서버 일정과 무관하게 개발한다 |
| 3D 성능(렉, 발열) | 화질 3단계, `low`는 미리 구운 그림자·후처리 없음. 움직임이 없거나 화면이 가려지면 그리지 않는다. 실기기에서 먼저 확인하고 여유가 있을 때만 연출을 더한다 |
| 화면과 실제 로봇의 어긋남 | `ts`·`seq`로 0.15초 지연 버퍼 보간. 값이 안 오면 팔을 멈추고 "연결 끊김". 최종 확인은 CCTV와 상태 표시 |
| 로봇 기종 미정 | 범용 모델 + 설정값 분리. 구조가 다르면 새로 그린다 |
| 위험 조작 | 서버가 요청마다 권한·실행 가능 여부를 검사한다. 앱은 확인 단계와 권한 확인(요청 안 보냄)을 더할 뿐이다. 비상정지는 물리 버튼 |
| 권한 표시와 실제 차단의 어긋남 | 6절 권한 표 하나를 화면·api·서버 테스트가 함께 돈다 |
| 장시간 구동 | 새벽 자동 새로고침, 메모리·재연결 장시간 테스트, 충전기 연결과 화면 꺼짐 끄기 |
| 안드로이드 개발자 인증 정책 | 배포 전 한국 적용 시점 확인, 필요하면 등록, 대안으로 웹(PWA) |
| 시안 이미지와 실제 구현의 차이 | 대표님께는 실제로 돌아가는 시안을 보인다 |
| 현장 밖 접속과 원격 수동 조작 | HTTPS, 로그인 시도 제한, 접속·조작 기록, 요청마다 권한 검증, 위험 명령 재인증을 서버 담당과 합의. VPN 병행은 열어 둔다. 물리 비상정지와 안전 인터록은 앱·네트워크와 무관 |
| 확인 전 가정으로 개발 | 가정 표를 시안과 함께 전달하고, 가정에 의존하는 값은 설정으로 분리한다 |
