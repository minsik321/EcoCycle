# 스마트 폐지 처리 대시보드 개발 플랜 및 API 명세서

Oct 13, 2026 · @민식

## 개요와 확정 사항

파지 선별·압축 설비를 한 화면에서 보고 조작하는 안드로이드 태블릿 우선 대시보드를 만들며, 이 문서는 프론트 개발 범위와 서버가 제공해야 할 API를 정한다.

| 항목 | 확정 내용 |
| --- | --- |
| 대상 기기 | 안드로이드 태블릿 우선, 폰은 요약 화면 중심 |
| 개발 방식 | 웹(React)으로 만든 뒤 Capacitor로 안드로이드 앱 빌드 |
| 홈 화면 | 밝은 아이소메트릭 3D 장면(파지 처리 공장 전체) 위에 패널을 띄움(앱의 3D 홈은 하나뿐이다: `app/src/studio`, 2026-10-14 기존 장면 삭제). 연출 수준은 화질 3단계(high, standard, low)로 나누고 그림자·발광·빛 번짐은 상위 단계에서만 씀. 홈 맨 위의 전환 하나 "3D | 대시보드"로 3D 장면과 3D 없는 대시보드(상태 요약, 지표 3개, 섹터 4칸, 지금 배치, 6단계 공정 추적, 최근 차량·베일)를 오가고 고른 쪽은 기기에 기억(기본 3D). 3D를 그릴 수 없거나 3D에서 오류가 나면 대시보드로 보여 주고 짧게 알림 |
| 장면 구성 | 입고 도로·게이트·계중대, 지붕을 잘라낸 본관 안의 수납 섹터 4개(A1, A2, B1, B2, 기존 탱크와 같은 대상), 중앙 로봇팔, 로봇 옆에서 압축기까지 이어지는 긴 컨베이어 하나(Section Z), 압축기, 출하장 |
| 확대 | 기기나 핀을 누르면 카메라가 그 대상으로 이동하며 확대하고 대상이 움직이면 따라감. 끌어서 이동, 핀치·휠 확대, ±35도 안의 제한 회전을 부지 경계 안에서 허용하고 자유 회전은 없음 |
| 로봇팔 | 서버가 보내는 관절 각도와 그리퍼 값으로 움직임, 범용 로봇팔 모델로 시작하고 링크 길이와 축은 설정값으로 분리 |
| 상세 카드 | 적재율, 부피(용량), 상태, 위치를 표시, 사진 대신 장면 그림, 무게는 쓰지 않음(무게는 차량·하역 기록의 계중대 순중량에만, 6절 "공통 규칙") |
| 조작 | 간단한 조작은 홈의 확대 화면에서, 상세 보기를 누르면 기기 페이지로 이동, 위험한 조작은 기기 페이지에서만, 같은 조작 컴포넌트를 두 곳에서 재사용 |
| 로그인과 권한 | 서버가 처리, 프론트는 서버가 알려 준 권한대로 화면만 다르게 표시 |
| CCTV | 버튼을 누르면 별도 화면으로 열고, 열려 있는 동안 3D 그리기는 멈춤 |
| 후퇴 순서 | 관절 값 연동 → 진행률 기반 동작 → 정해진 동작 반복(최후) |
| 접속과 보안 | 현장 밖에서도 접속하며 로그인으로 보호, 서버 쪽 보안 설정은 서버 담당과 확인 |
| 운전 방식 | 자동 운전은 서버가 처리, 대시보드는 사람이 수동으로 조작하는 용도 |
| 사용자와 기기 | 회사 내부 관계자 소수, 태블릿 기종 제한 없음(화질 3단계 중 가장 낮은 단계가 저사양 태블릿의 안전판) |
| 진행 방식 | 대표님·현장 책임자 확인 전이라 가정 기반 프로토타입을 먼저 전달하고 피드백으로 수정 |

홈 화면은 시각 품질도 목표로 삼되, 가장 낮은 화질 단계는 실제 저사양 태블릿에서 끊김 없이 도는 것만을 기준으로 하고 상위 단계의 연출이 이 기준을 깨면 안 된다.

### 용어집

**배치(batch)**는 섹터 배합·평균 수분·목표 압력을 정해 압축기에 공급하는 한 번의 혼합 작업이다. **베일(bale)**은 압축·결속하여 배출한 블록 하나다. 목업은 배치당 베일 하나를 만들지만 `baleIds[]`와 `Bale.batchId`로 1→N을 허용한다.

## 범위와 역할 분담

프론트 담당은 화면, 앱 빌드, 모의 서버까지이며, 로봇·센서 서버와 로그인·권한·알림·영상 변환은 서버 쪽 담당이 필요하다. 담당이 정해지지 않은 항목은 7절의 확인 상태와 가정으로 관리한다.

| 영역 | 담당 | 내용 |
| --- | --- | --- |
| 대시보드 화면 | 프론트 | 홈 3D 장면, 기기 페이지, 사이드바, 알림 표시, 권한별 화면 분기 |
| 안드로이드 앱 | 프론트 | Capacitor 빌드와 배포(APK 또는 Firebase App Distribution) |
| 모의 서버 | 프론트 | 서버 준비 전에 가짜 센서 값과 관절 값을 흘려 주는 개발용 서버 |
| 센서·로봇 데이터 수집과 API | 서버 (확인 필요) | 6절의 조회 API와 실시간 스트림 제공 |
| 로그인과 권한 검증 | 서버 (확인 필요) | 토큰 발급, 요청마다 권한 검증, 조작 명령 차단. 담당이 없으면 얇은 게이트웨이 신설 여부를 협의 |
| 푸시 알림 발송 | 서버 (확인 필요) | 이상 감지 시 FCM으로 발송 |
| CCTV 영상 변환 | 서버 (확인 필요) | RTSP를 HLS 또는 WebRTC로 변환하고 접근 권한이 걸린 주소 발급 |
| 비상정지와 안전 인터락 | 현장 설비 | 물리 비상정지 버튼과 로봇 제어 시스템이 담당하며 앱과 네트워크에 의존하지 않음 |
| 로봇 AI 학습 | 별도 | 대표님 계획(시연 데이터 수집과 학습)이며 이 문서의 범위 밖 |

서버 개발까지 요청받으면 별도 범위로 보고 일정과 조건을 따로 정한다.

## 화면 구성

정보는 세 단계로 나눠 홈은 “지금 정상인가”, 확대 화면은 “이 기기 상태가 어떤가”, 기기 페이지는 “왜 그런가, 설정은, 이력은”에 답한다. 매번 확인하고 이상이면 바로 조치해야 하는 정보는 홈, 기기를 눌렀을 때 바로 필요한 정보는 확대 화면, 가끔 찾아보거나 신중해야 하면 기기 페이지에 둔다.

| 기기 | 홈 (줌아웃) | 확대 화면 | 기기 상세 페이지 |
| --- | --- | --- | --- |
| 탱크 | 수위(%), 수분, 상태 색 | 부피(용량), 수분 수치, 마지막 갱신 시각, 짧은 추이 | 이력 그래프, 기준값 설정, 알람 이력 |
| 로봇팔 | 동작 단계, 작업 중 탱크, 이상 여부 | 움직임 확대, 모드, 시작·일시정지 | 관절 값, 수동 조작, 오류 로그, 사이클 통계 |
| 컨베이어 | 가동·정지 | 가동 상태, 적재 정도 | 속도 설정, 이력 |
| 압축기 | 가동 상태, 이상 여부 | 압력, 온도 | 압력·온도 그래프, 설정, 점검 이력 |

홈 공통 요소와 규칙은 다음과 같다.

- 상단 지표 카드: 오늘 처리량(베일 수), 평균 함수율, 압축기 가동률. 카드마다 작은 추이선을 둔다. 시스템 상태는 상단 바에 표시하고 전체 적재율은 섹터 표에서 본다. 한 기기당 숫자는 2개 정도로 제한한다.
- 하단 공정 추적: 입고, 차량 인식, 하역, 배합, 압축, 출하. 서버가 보낸 공정 흐름 값(6절 "공정 흐름")에 연결하고 단계별 시각을 표시하며 정지·오류·연결 끊김은 색으로 눈에 띄게 표시한다. 로봇의 동작 단계(집기, 이동, 놓기)는 로봇 상세 패널에 둔다.
- 주 메뉴: 홈, 섹터(기존 탱크와 같은 대상), 로봇팔, 컨베이어, 압축기, 알람, 공정 기록, 설정. 앱 어디서나(3D 홈 포함) 같은 메뉴 하나를 쓴다. 폰은 아래 탭 바(자주 쓰는 4개 + "더 보기"), 태블릿·데스크톱은 왼쪽 사이드바이고 3D 홈에서는 아이콘만 남게 접혀 있다가 누르면 펼친다. 지금 화면의 메뉴는 어디서나 같은 모양으로 강조한다. 권한이 없는 메뉴는 숨기거나 비활성화한다.
- 핀과 기기 탭: 정해진 위치로 카메라가 이동하고 우측 상세 카드(적재율, 부피, 상태, 위치)와 상세 보기 버튼이 열린다.
- 연결 끊김: 값이 갱신되지 않으면 마지막 값을 그대로 두지 않고 “연결 끊김”과 마지막 수신 시각을 표시하고 로봇팔은 멈춘다.
- 알람은 단계와 상관없이 홈에서 색과 아이콘으로 눈에 띄게 하고, 누르면 해당 기기 페이지로 이동한다.

홈과 확대 화면에서 할 수 있는 간단한 조작과 기기 페이지에서만 할 수 있는 조작은 아래 기준으로 나눈다. 기준은 “되돌리기 쉽고 위험이 낮은가”이며, 실제 조작 목록은 프로토타입 피드백으로 확정한다.

| 홈에서 가능 (간단) | 기기 페이지에서만 (신중) |
| --- | --- |
| 시작, 일시정지, 재개 | 수동 모드 전환, 수동 이동·집기 지정 |
| 알람 확인 처리 | 설정값 변경(기준 수위, 속도 등) |
| 표시 모드 전환 | 비상 복구·초기화 같은 위험 작업 |

## 기술 구성

서버가 값을 모으고 권한을 검증하며, 앱은 화면을 그리고 명령을 보내기만 한다.

&#91;embedded content: 시스템 구성 · 현장, 서버, 앱, 영상 경로\]

강조된 박스가 권한 검증과 명령 차단을 맡는 서버이며, 개발 중에는 모의 서버가 그 자리를 대신한다.

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프론트 | React | 웹으로 먼저 만들고 브라우저에서 바로 확인 |
| 3D | Three.js (react-three-fiber) | 공장 장면을 관절 값·공정 흐름 값으로 구동, 3D 홈을 열 때만 내려받음 |
| 앱 | Capacitor | 웹 코드를 그대로 안드로이드 앱으로 빌드하고 푸시 알림 지원 |
| 실시간 | WebSocket 하나, REST는 조회와 명령 | 요청을 반복하지 않고 서버가 값을 밀어 줌 |
| 영상 | HLS 또는 WebRTC | 서버가 RTSP를 변환하고 앱은 video 태그로 재생만 함 |
| 알림 | 앱이 켜져 있으면 WebSocket, 닫혀 있으면 FCM | 푸시는 지연되거나 누락될 수 있음 |

성능 원칙은 다음과 같다.

1. 화질을 3단계로 나눈다. `low`는 불투명 저폴리, 줄인 오브젝트 수, 바닥에 미리 그린 그림자, 블러 없는 단색 패널만 쓴다. `standard`는 그림자 조명 하나(낮은 해상도)와 주요 패널의 블러까지, `high`는 실시간 부드러운 그림자, 은은한 발광, 빛 번짐, 전체 패널 블러까지 쓴다. 접속할 때 짧은 프레임 측정으로 단계를 자동 선택하고 설정에서 바꿀 수 있다.
2. 움직임이 없으면 그리기를 멈추고, 화면이 숨겨지거나 CCTV가 열리면 그리기 루프를 정지한다.
3. 화면은 초당 30프레임 이하로 제한하고, 센서 값이 빨라도 화면 반영은 초당 몇 번으로 줄인다. 관절 값만 초당 10\~20회 받고 사이 값은 보간한다.
4. 탱크 안 파지는 같은 모양을 묶어 한 번에 그리고, 수위 값에 맞춰 보이는 조각 수를 조절한다.
5. 로봇팔 그리기 코드는 입력(정해진 각도, 모의 값, 실제 센서 값)과 분리해 입력만 바꾸면 되게 한다.
6. 가장 낮은 사양의 실제 태블릿에서 30분 이상 구동해 끊김과 발열을 확인한 뒤 연출을 추가한다.

## 개발 단계

핵심 기능을 일반 화면으로 먼저 완성하고, 3D 홈은 그 위에 얹는다. 일정이 빠듯해지면 3D 홈을 뒤로 미룰 수 있고, 먼저 모의 서버로 프로토타입을 만들어 전달하고, 일정은 피드백과 서버 준비 시점에 맞춰 정한다.

| 단계 | 목표 | 완료 기준 |
| --- | --- | --- |
| 0. 준비 | 가정 확정(7절), 프로토타입 전달 후 대표님·서버 담당 확인 | 프로토타입과 가정 표를 전달하고 피드백 수집 |
| 1. 핵심 기능 | 로그인, 기기 페이지(탱크·로봇·컨베이어·압축기), 센서 수치, 알람, 권한별 화면, CCTV 버튼을 모의 서버로 구현 | 권한별 화면 분기와 연결 끊김 표시가 동작 |
| 2. 3D 홈 시안 | 밝은 저폴리 공장 장면(입고부터 출하까지), 섹터 적재율 연동, 모의 관절 값으로 로봇팔 구동, 공정 흐름 값으로 차량·압축·출하 연출, 카메라 이동과 상세 패널, 화질 3단계 | 실제 태블릿에서 초당 30프레임 안정, 30분 이상 구동해 끊김·발열 확인 |
| 3. 실서버 연동 | 모의 서버를 실제 API로 교체, 관절 값 매핑(축 수, 영점, 단위) 확인 | 실제 값으로 로봇팔이 움직이고 연결이 끊기면 정지·표시 |
| 4. 장시간·현장 테스트 | 장시간 구동(메모리, 재연결), 앱 배포, 사용자 피드백 | 하루 이상 구동해도 느려짐·멈춤 없음 |
| 5. 확장 | 압축기 이후 공정을 스크롤로 이어 붙이기, 저사양 모드 | 2단계 테스트에서 여유가 확인된 경우에만 진행 |

로봇팔을 실제 움직임에 맞출 수단은 세 가지이며 위에서부터 시도한다.

1. 관절 각도와 그리퍼 값을 실시간으로 받아 그린다 (가장 정확하고 자연스럽다).
2. 서버가 단계와 진행률(예: 이동 중 60%)만 보내고 화면이 진행률에 맞춰 팔을 움직인다.
3. 탱크에서 집어 컨베이어에 올리는 정해진 동작을 반복 재생한다 (실제와 어긋날 수 있어 최후의 수단).

## API 명세서

대시보드는 REST로 현재 값과 이력을 조회하고 WebSocket 하나로 실시간 값을 받으며, 모든 권한 판단은 서버가 한다. 이 명세는 초안이며 서버 담당자와 합의하며 바꾸어야 한다.

### 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| 기본 주소 | `https://{server}/api/v1`, 실시간은 `wss://{server}/ws/v1/stream` |
| 형식 | JSON, UTF-8 |
| 시각 | ISO 8601 UTC 문자열 (예: `2026-10-13T05:23:11.250Z`) |
| 단위 | 수위·수분·적재율 %(0\~100), 부피 m³, 압력 MPa, 온도 °C, 각도 도(degree), 무게 t(차량·하역 기록에만) |
| 인증 | `Authorization: Bearer {accessToken}` |
| 기기 ID | `tank-a1`, `tank-a2`, `tank-b1`, `tank-b2`, `robot-1`, `conveyor-z`, `compressor-1` |
| 오류 형식 | `{"error":{"code":"FORBIDDEN","message":"..."}}` |

| 상태 코드 | 의미 | 클라이언트 처리 |
| --- | --- | --- |
| 401 | 토큰 만료 | 리프레시 토큰으로 재발급 후 재시도, 실패하면 로그인 화면 |
| 403 | 권한 없음 | 조작 거부 안내 표시 |
| 409 | 현재 상태에서 불가 (예: 로봇 오류 중) | 이유를 표시 |
| 422 | 잘못된 값 | 입력 오류 표시 |
| 429 | 요청 너무 많음 | 잠시 대기 후 재시도 |
| 503 | 서버 준비 안 됨 | 연결 끊김 표시 |

파지의 양은 대상마다 하나의 기준으로 적는다(2026-10-15, 대표님 확인 전 가정, `docs/questions.md` A12).

| 대상 | 양의 기준 | 필드 |
| --- | --- | --- |
| 차량·하역 기록 | 계중대 순중량 t (총중량 − 공차). 세 값을 모두 저장하고 보낸다 | `grossT`, `tareT`, `netT` |
| 섹터(탱크) 상태 | 적재율 %와 부피 m³ | `fillPercent`, `volumeM3`, `capacityM3` |
| 로봇 집기 기록 | 부피 m³ 또는 횟수 | `volumeM3` 또는 `count` |

무게는 차량·하역 기록에만 쓰고, 섹터·기기 상태와 실시간 메시지에는 무게 필드를 두지 않는다.

### 인증

| 메서드와 경로 | 설명 | 요청 | 응답 |
| --- | --- | --- | --- |
| POST `/auth/login` | 로그인 | `{"id","password","remember","refreshTokenDelivery"}` | `{"accessToken","refreshToken"(body 방식만),"expiresIn","user"}` |
| POST `/auth/refresh` | 토큰 재발급 (리프레시 토큰은 사용할 때마다 교체) | 웹: 본문 `{}` + 쿠키, 앱: `{"refreshToken"}` | 새 `accessToken`, 새 리프레시 토큰(쿠키 또는 본문) |
| POST `/auth/logout` | 로그아웃, 서버에서 세션(리프레시 토큰 묶음) 폐기, 쿠키 삭제 | 웹: 본문 `{}` + 쿠키, 앱: `{"refreshToken"}` | 204 |
| POST `/auth/ws-ticket` | WebSocket 연결용 1회용 티켓 (30초 유효) | 없음 | `{"ticket","expiresIn"}` |
| GET `/me` | 내 정보와 권한 | 없음 | `{"id","name","role","permissions"}` |

`role`은 `admin`, `operator`, `viewer` 중 하나이고 실제 권한 종류는 대표님과 정한다. `permissions`는 `robot.control`, `robot.manual`, `settings.write`, `alarm.ack` 같은 문자열 목록이고 프론트는 이 목록으로 버튼 표시만 정한다. 브라우저 WebSocket은 헤더를 보낼 수 없어 토큰을 주소에 넣지 않고 티켓을 쓴다.

#### 토큰 보관과 자동 로그인

액세스 토큰은 앱 메모리에만 둔다. 어떤 토큰도 localStorage·sessionStorage·주소(URL)에 두지 않는다. 리프레시 토큰은 앱이 어디서 도는지에 따라 두 방식 중 하나로 주고받는다.

| 항목 | 웹 (`refreshTokenDelivery: "cookie"`) | 안드로이드 앱 (`"body"`) |
| --- | --- | --- |
| 보관 | 서버가 쿠키로 심는다. 스크립트는 읽을 수 없다 | Android Keystore 기반 보안 저장소(Capacitor 플러그인) |
| 응답 | 본문에 `refreshToken`을 넣지 않고 `Set-Cookie`만 보낸다 | 본문에 `refreshToken`을 넣고 쿠키는 쓰지 않는다 |
| 리프레시·로그아웃 요청 | 본문 `{}`, `credentials: "include"`로 쿠키가 따라간다 | 본문 `{"refreshToken"}` |
| `remember: true` (자동 로그인) | 지속 쿠키 `Max-Age` 14일 | 보안 저장소에 저장, 앱을 다시 켜도 유지 |
| `remember: false` | 세션 쿠키(`Max-Age` 없음), 브라우저를 닫으면 사라진다 | 메모리에만, 앱을 닫으면 사라진다 |

- 쿠키 속성: 이름 `ecocycle_rt`, `HttpOnly`, `Secure`, `Path=/api/v1/auth`(인증 경로에만 전송). `SameSite`는 앱과 API가 같은 사이트면 `Lax`, 다른 사이트(예: Vercel + Render)면 `None`(+`Secure`, `Partitioned`).
- 쿠키를 쓰는 요청은 CORS가 `Access-Control-Allow-Credentials: true`와 **명시한 출처 목록**으로만 허용해야 한다(`*` 불가). 서버는 쿠키로 온 리프레시·로그아웃 요청의 `Origin`도 같은 목록으로 확인한다.
- `remember`를 빼면 `false`, `refreshTokenDelivery`를 빼면 `"body"`로 본다.
- 리프레시 토큰 유효 시간: 자동 로그인 14일, 아니면 12시간. 리프레시할 때마다 새 토큰이 같은 시간으로 다시 시작한다(사용 중에는 풀리지 않는다).
- **교체와 재사용 감지:** 리프레시할 때마다 새 리프레시 토큰을 주고 이전 토큰은 사용 완료로 표시한다. 이미 쓴 토큰이 다시 오면 탈취로 보고 그 토큰이 속한 세션(로그인 한 번에서 이어진 토큰 묶음)의 모든 리프레시·액세스 토큰과 WebSocket 연결을 폐기하고 401을 준다.
  - **유예 시간(30초):** 교체 직후 30초 안에 **바로 앞** 토큰이 다시 오고, 그 교체로 준 새 리프레시 토큰이 아직 쓰이지 않았으면 재사용으로 보지 않고 **방금 준 새 토큰 쌍을 그대로 다시** 준다(200, 쿠키도 같은 값). 요청은 서버에 닿았는데 응답을 잃은 경우(새로고침·화면 이동·네트워크 끊김) 정상 사용자가 로그아웃되지 않게 하기 위해서다. 30초가 지났거나 그 뒤 교체가 또 일어났으면 위와 같이 세션을 폐기한다.
- 리프레시 거부 코드(401): `REFRESH_TOKEN_MISSING`(토큰 없음), `REFRESH_TOKEN_EXPIRED`(만료), `REFRESH_TOKEN_REUSED`(재사용 감지, 세션 폐기), `UNAUTHORIZED`(모르는 토큰, 서버 재시작 등). 거부할 때 웹 쿠키도 지운다.
- 앱 시작: 웹은 항상, 앱은 보안 저장소에 토큰이 있으면 `POST /auth/refresh`를 부른다. 성공하면 액세스 토큰을 메모리에 두고 `GET /me`로 최신 권한을 받아 로그인 화면 없이 들어간다(그동안 "로그인 확인 중…"). 거부되면 로그인 화면, 서버에 닿지 못하면 다시 시도할 수 있게 안내하고 토큰은 지우지 않는다.
- 로그아웃: 서버가 세션을 폐기하고 쿠키를 지운다. 앱은 보안 저장소와 메모리의 토큰을 지운다. 서버 요청이 실패해도 기기의 토큰은 지운다.
- 여러 탭이 같은 쿠키로 동시에 리프레시하면 재사용으로 오인되므로 웹은 탭 사이에서 리프레시를 한 번에 하나만 보낸다(Web Locks).

현장 밖에서도 접속하고 로그인으로 보호하므로 서버에 두 가지를 권장한다. 로그인 시도 횟수를 제한하고(초과 시 429) 접속·조작 기록을 남긴다. 위험도가 높은 명령(수동 모드 전환, 설정 변경 등)은 비밀번호나 PIN을 다시 입력하게 하며, 재인증 방식은 서버 담당과 정한다.

### 조회

| 메서드와 경로 | 설명 |
| --- | --- |
| GET `/plant/summary` | 상단 카드용 요약: 평균 수분, 전체 적재율, 시스템 상태 |
| GET `/devices` | 기기 목록과 현재 상태 |
| GET `/devices/{id}/state` | 기기 하나의 최신 상태 |
| GET `/devices/{id}/history?metric=level&from=...&to=...&interval=1m` | 이력 시계열 (그래프용) |
| GET `/devices/{id}/unloads/records?from=...&to=...&page=1&pageSize=10` | 섹터(탱크) 하나의 하역 기록 (섹터 기기 ID만, 아래 "기록 목록" 모양) |
| GET `/vehicles/records?from=...&to=...&page=1&pageSize=10` | 차량 기록 (입차 시각 기준, 아래 "공정 기록" 모양) |
| GET `/vehicles/{id}` | 차량 기록 한 건 (목록 한 줄과 같은 모양). 없으면 404 |
| GET `/batches/records?from=...&to=...&page=1&pageSize=10` | 배치 기록 (시작 시각 기준, 아래 "공정 기록" 모양) |
| GET `/batches/{id}` | 배치 기록 한 건 (목록 한 줄과 같은 모양). 없으면 404 |
| GET `/robots/{id}/model` | 로봇 모델 정보: 축 수, 관절 순서, 링크 길이, 각도 범위, 영점 (기종이 정해지면 이 값으로 화면을 맞춘다) |
| GET `/alarms?state=active` | 알람 목록 |
| GET `/cameras` | 카메라 목록 |

#### 기록 목록 (페이지 나누기)

차량·하역·로봇 집기처럼 지난 기록을 보는 모든 목록은 같은 요청·응답 모양을 쓴다. 엔드포인트 이름은 기록마다 정하고(예: `GET /vehicles/records`), 모양은 여기 하나로 정한다. 프론트 제안안이다(`docs/questions.md` B29).

```
GET .../records?from=2026-10-15T00:00:00.000Z&to=2026-10-15T05:30:00.000Z&page=1&pageSize=10
```

| 쿼리 | 설명 |
| --- | --- |
| `from`, `to` | 구간 `[from, to)`, ISO 8601 UTC. 화면은 현지 날짜(오늘·어제·최근 7일·직접 선택)를 UTC로 바꿔 보낸다 |
| `page` | 1부터 센다 |
| `pageSize` | 한 쪽의 줄 수. 화면은 10, 서버 상한 100 |

```json
{ "items": [ ... ], "total": 23, "page": 1, "pageSize": 10 }
```

- `items`는 최신 기록이 먼저(시각 내림차순), `total`은 구간 안 전체 건수다. 쪽 수는 `ceil(total / pageSize)`.
- 전체 쪽 수보다 큰 `page`는 오류가 아니라 빈 `items`를 돌려준다. 빠진 쿼리, `from >= to`, 범위 밖 `page`·`pageSize`는 422.
- 각 기록의 시각 필드는 ISO 8601 UTC 문자열이다.

섹터 하역 기록(`GET /devices/{id}/unloads/records`)의 한 줄은 다음과 같다. 차량이 그 섹터에 하역하고 출차 계량(공차)을 마치면 한 줄이 생기고, 기록 시각은 하역 완료 시각(`unloadedAt`)이다.

```json
{
  "id": "unl-20261015-034", "vehicleId": "veh-20261015-034", "sectorId": "tank-a1",
  "plate": "12가 3456", "companyName": "한빛자원",
  "unloadedAt": "2026-10-15T04:12:40.000Z",
  "grossT": 18.42, "tareT": 9.86, "netT": 8.56,
  "fillBeforePercent": 42.0, "fillAfterPercent": 55.1
}
```

- 무게는 계중대 값(t): 입차 총중량 `grossT`, 출차 공차 `tareT`, 순중량 `netT = grossT − tareT`(서버가 계산해 저장).
- `fillBeforePercent`·`fillAfterPercent`는 하역 직전·직후의 섹터 적재율 %. 화면은 두 값과 차이(%p)를 적기만 한다.

##### 공정 기록 (차량·배치)

"공정 기록" 화면의 두 목록은 같은 기록 목록 모양이다. 지금 진행 중인 차량·배치도 목록에 들어 있고(`status`·`result`가 진행 상태를 알려 준다), 끝나면 같은 줄이 바뀐다. 지난 30일 안의 기록을 준다(제안).

차량 기록 `GET /vehicles/records` (기록 시각은 입차 시각 `arrivedAt`):

```json
{
  "id": "veh-20261015-034", "status": "departed",
  "plate": "12가 3456", "companyName": "한빛자원", "sectorId": "tank-a1",
  "arrivedAt": "2026-10-15T04:11:58.000Z", "departedAt": "2026-10-15T04:13:25.000Z",
  "grossT": 18.42, "tareT": 9.86, "netT": 8.56,
  "stageTimes": { "arrived": "...", "identified": "...", "unloading": "...", "unloaded": "...", "departed": "..." }
}
```

- `status`는 서버가 정한다: `identified`(인식: 계중대 도착·번호판 인식), `unloading`(하역: 하역 중·하역 완료), `departed`(출차). 번호판·회사·배정 섹터는 인식 전에는 `null`이다.
- `grossT`는 입차 계량이라 처음부터 있고, `tareT`·`netT`는 출차 계량 뒤에야 있다(그 전에는 `null`). `departedAt`도 출차 전에는 `null`.

배치 기록 `GET /batches/records` (기록 시각은 시작 시각 `startedAt`):

```json
{
  "id": "batch-0407", "result": "completed",
  "startedAt": "2026-10-15T04:20:00.000Z", "endedAt": "2026-10-15T04:24:10.000Z",
  "mix": [{ "sectorId": "tank-a1", "percent": 40 }, { "sectorId": "tank-b2", "percent": 60 }],
  "avgMoisturePercent": 11.8, "targetPressureMpa": 28.5, "actualPressureMpa": 28.3,
  "balesProduced": 1, "baleIds": ["BL-20261015-0407"]
}
```

- `result`: `completed`(완료), `skipped`(건너뜀: 압축하지 않고 넘어감), `paused`(일시정지됨: 일시정지된 채 끝남), 진행 중이면 `null`.
- `actualPressureMpa`는 압축 때 실제로 낸 압력(MPa)이고 압축하지 않았거나 아직 압축 전이면 `null`. `endedAt`은 진행 중이면 `null`. `balesProduced`는 `baleIds`의 길이다.
- 배치·베일 상세 화면(5단위)이 쓸 `GET /batches/{id}`는 목록 한 줄과 같은 모양을 준다.

기기별 상태 형식은 다음과 같으며 `status`가 `normal`, `caution`, `alarm`, `offline` 중 무엇인지는 서버가 기준값으로 정해서 보낸다.

```json
// 탱크: GET /devices/tank-a1/state
{
  "id": "tank-a1", "type": "tank", "section": "A1", "grade": "A",
  "status": "normal",
  "fillPercent": 72.4, "volumeM3": 5.8, "capacityM3": 8.0,
  "cautionThresholdPercent": 80,
  "moisturePercent": 11.8,
  "updatedAt": "2026-10-13T05:23:11.250Z"
}

// 로봇팔: GET /devices/robot-1/state
{
  "id": "robot-1", "type": "robot",
  "status": "running", "mode": "auto",
  "phase": "move", "targetTankId": "tank-a1",
  "gripper": { "closed": true, "holding": true },
  "updatedAt": "2026-10-13T05:23:11.250Z"
}

// 컨베이어: GET /devices/conveyor-z/state
{ "id": "conveyor-z", "type": "conveyor", "status": "normal", "running": true, "loadPercent": 40, "itemsToBaler": 2, "updatedAt": "..." }

// 압축기: GET /devices/compressor-1/state
{ "id": "compressor-1", "type": "compressor", "status": "normal", "running": true, "pressureMpa": 28.7, "temperatureC": 42.3, "cycleStage": "pressing", "updatedAt": "..." }
```

컨베이어의 `itemsToBaler`는 로봇이 벨트에 놓았지만 아직 압축기에 닿지 않은 집기 덩어리 수(개, 0 이상 정수)다. 컨베이어가 멈추면 줄지 않는다. 압축기의 `cycleStage`는 압축 사이클의 지금 단계로 `idle`(대기), `filling`(배합 중인 배치의 파지를 받는 중), `pressing`(압축 중), `ejecting`(결속·배출) 중 하나다. 둘 다 서버가 정하고 화면은 표시만 한다(기기 페이지 재설계, 2026-10-15 프론트 제안안 — `docs/questions.md` B32).

섹터의 `cautionThresholdPercent`는 지금 적용 중인 주의 기준 적재율(설정 `cautionThresholdPercent`의 현재값)이다. 서버는 이 값으로 `status`를 판정하고, 화면은 섹터 그림에 주의선으로 그리기만 한다. `update_setting`으로 바뀌면 다음 상태에 새 값이 실린다.

`phase`는 `idle`, `pick`, `move`, `place` 중 하나로 하단 단계 바에 쓰이고, `robot.status`는 `idle`, `running`, `paused`, `stopped`, `error`, `offline` 중 하나다. 기기 상태에는 무게를 쓰지 않고 부피와 용량을 쓴다.

### 실시간 스트림 (WebSocket)

연결 순서는 `POST /auth/ws-ticket`로 티켓을 받아 `wss://{server}/ws/v1/stream?ticket={ticket}`에 연결한 뒤 구독하고 싶은 주제를 보내는 것이다. 로봇팔 관절 값은 양이 많아 홈과 로봇 확대 화면에 있을 때만 구독하고 다른 화면에서는 해제한다.

```json
// 클라이언트 -> 서버
{ "type": "subscribe", "topics": ["plant", "devices", "alarms", "robot-1.joints"] }
{ "type": "unsubscribe", "topics": ["robot-1.joints"] }
```

| 서버 -> 클라이언트 메시지 | 보내는 시점 | 내용 |
| --- | --- | --- |
| `plant.summary` | 변할 때, 최소 5초마다 | 상단 카드 값 |
| `device.state` | 변할 때, 최소 5초마다 | 위 조회의 기기 상태와 같은 형식 |
| `robot.joints` | 초당 10\~20회 (구독 중일 때만) | 관절 각도, 그리퍼, 단계 |
| `alarm` | 발생·해제 시 | 알람 하나 |
| `command.result` | 명령 처리 결과가 나왔을 때 | 명령 결과 |
| `heartbeat` | 5초마다 | 서버 시각 |

```json
// robot.joints: seq로 순서를, ts로 지연을 확인해 부드럽게 보간한다
{
  "type": "robot.joints", "deviceId": "robot-1",
  "seq": 1204, "ts": "2026-10-13T05:23:11.250Z",
  "joints": [12.5, -45.0, 80.2, 0.0, 35.7, 90.0],
  "gripper": { "closed": true, "holding": true },
  "phase": "move", "targetTankId": "tank-a1"
}

// alarm
{
  "type": "alarm",
  "alarm": { "id": "al-3301", "level": "caution", "deviceId": "tank-a2",
             "message": "적재율 80% 초과", "state": "active", "ts": "2026-10-13T05:23:11.250Z" }
}
```

클라이언트는 마지막 메시지로부터 15초 동안 아무것도 받지 못하면 연결 끊김으로 표시하고 로봇팔을 멈추며, 연결이 복구되면 조회 API로 현재 상태를 한 번 다시 받아 맞춘다. 관절 각도 순서와 단위는 `/robots/{id}/model`의 정의를 따른다.

### 명령

명령은 이름이 아니라 정해진 종류로 보내고, 실행 가능 여부와 권한은 항상 서버가 다시 검증한다. 화면의 비활성 버튼은 편의 기능일 뿐 차단 수단이 아니다.

| 메서드와 경로 | 설명 |
| --- | --- |
| POST `/devices/{id}/commands` | 기기에 명령 전송. 헤더 `Idempotency-Key` 필수(중복 전송 방지) |
| GET `/commands/{commandId}` | 명령 처리 결과 조회 (WebSocket을 못 받았을 때) |

| 명령 `type` | 대상 | 위험도 | 필요 권한 | 추가 필드 |
| --- | --- | --- | --- | --- |
| `start`, `pause`, `resume` | 로봇·컨베이어·압축기 | 낮음 (홈에서 가능) | `robot.control` | 없음 |
| `stop` | 로봇·컨베이어·압축기 | 낮음 (홈에서 가능) | `robot.control` | 없음 |
| `set_mode` | 로봇 | 높음 (기기 페이지에서만) | `robot.manual` | `mode`: `auto`, `manual`, `auto_pinned`; 지정 자동은 `pinnedSectors` 1개 이상, `confirm: true` |
| `pick_from` | 로봇 (수동 모드에서만) | 높음 (기기 페이지에서만) | `robot.manual` | `tankId`, `confirm: true` |
| `update_setting` | 전체 기기 | 높음 (기기 페이지에서만) | `settings.write` | `key`, `value`, `confirm: true` |
| `ack_alarm` | 알람 | 낮음 | `alarm.ack` | `alarmId` |

```json
// 요청: POST /devices/robot-1/commands
{ "type": "pick_from", "tankId": "tank-a1", "confirm": true }

// 응답 202: 접수되었을 뿐 완료가 아니다
{ "commandId": "cmd-8841", "status": "accepted" }

// WebSocket command.result
{ "type": "command.result", "commandId": "cmd-8841", "status": "completed", "reason": null }
```

`status`는 `accepted`, `rejected`, `completed`, `failed` 중 하나이고 `rejected`와 `failed`에는 `reason`을 담는다. 화면은 조작 결과(성공, 거부, 실패)를 홈에서도 바로 보여 준다.

### 알림과 알람

| 메서드와 경로 | 설명 |
| --- | --- |
| POST `/push/register` | 안드로이드 기기의 FCM 토큰 등록: `{"fcmToken","platform":"android"}` |
| DELETE `/push/register` | 로그아웃 시 등록 해제 |
| GET `/alarms?state=active&from=...` | 알람 목록과 이력 |

앱이 켜져 있을 때는 WebSocket의 `alarm` 메시지로, 앱이 닫혀 있을 때는 서버가 FCM으로 알림을 보낸다. 푸시 알림은 지연되거나 누락될 수 있어 안전과 직결된 위험 알림을 이것에만 의존하지 않는다.

### CCTV

| 메서드와 경로 | 설명 |
| --- | --- |
| GET `/cameras` | 카메라 목록: `[{"id","name","location"}]` |
| GET `/cameras/{id}/stream` | 재생 주소 발급: `{"protocol":"hls","url":"...","expiresAt":"..."}` (주소는 만료되는 서명 주소여야 하고 가능하면 `webrtc`도 지원) |
| GET `/cameras/{id}/snapshot` | 현재 정지 화면 (JPEG) |

영상 변환은 서버 쪽 작업이고 프론트는 발급받은 주소를 `<video>`로 재생하기만 한다. 영상 주소도 로그인 검증을 거친 사용자에게만 발급해야 한다. 로봇 조작과 함께 볼 때는 지연이 짧은 WebRTC를 쓰고 HLS는 수 초 지연이 있어 참고용으로만 쓴다.

### 공정 흐름

홈 장면의 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하 흐름을 움직이는 값이다. 프론트가 제안한 형식이며 서버 담당과는 아직 합의하지 않았다(`docs/questions.md` B23~B27).

원칙은 세 가지다.

1. 번호판 → 회사, 회사 → 섹터 배정, 섹터 등급·수분, 배합비, 압축 압력은 모두 서버가 정한다. 프론트에는 이 값들을 정하는 로직이 없고 받은 값을 표시하고 움직임으로 옮기기만 한다.
2. 사건(event)만 흘리지 않고 **대상 전체 상태를 보낸다**(`device.state`와 같은 방식). 차량·배치·베일마다 `stage`가 바뀔 때 그 대상의 전체 값을 다시 보내므로, 메시지를 하나 놓쳐도 다음 메시지나 조회로 맞춰진다. 연결 복구 뒤에는 `GET /process/state` 한 번으로 현재 상태를 받는다.
3. 실시간 공정 흐름 메시지에는 무게 필드가 없다. 계중대의 무게는 차량·하역 기록(`grossT`, `tareT`, `netT`, t)으로 따로 받는다(6절 "공통 규칙"의 양의 기준).

| 메서드와 경로 | 설명 |
| --- | --- |
| GET `/process/state` | 공정 흐름 현재 상태: 진행 중인 차량·배치·베일과 최근 목록(표·검색용, 종류별 최근 20건 가정) |
| GET `/plant/history?metric=...&from=...&to=...&interval=...` | 요약 값의 이력(지표 카드의 작은 추이선용). 응답은 기기 이력과 같은 `points: [{ts, value}]` |
| GET `/plant/kpi-history?metric=...&range=today\|7d\|30d&timeZone=Asia/Seoul` | 7단위 KPI 상세(제안안): metric은 기존 세 지표. 오늘은 현지 자정부터 시간별, 7일·30일은 오늘 포함 일별. `{metric, range, from, to, interval, points:[{ts,value,runningMinutes?,stoppedMinutes?}], statistics:{current,average,min,max}, targetBand:{min,max}\|null, updatedAt}`. 생산량은 누적이 아닌 구간 생산 개수, current는 홈 현재값. 통계·목표 범위·가동/정지 분은 서버 집계. 잘못된 metric·range·IANA timeZone은 422. 인증 필요. 목업은 지난 30일을 생성하며 생산량은 야간·휴일 감소, 수분 변동, 정기 정지를 반영한다. |

실시간은 구독 주제 `process`를 추가하고 메시지 세 가지를 받는다.

| 서버 -> 클라이언트 메시지 | 보내는 시점 | 내용 |
| --- | --- | --- |
| `process.vehicle` | 차량의 `stage`나 값이 바뀔 때 | 차량 하나의 전체 상태 |
| `process.batch` | 배치의 `stage`나 값이 바뀔 때 | 배치 하나의 전체 상태 |
| `process.bale` | 베일의 `stage`가 바뀔 때 | 베일 하나의 전체 상태 |

```json
// process.vehicle — stage: arrived(계중대 도착) → identified → unloading → unloaded → departed
{
  "type": "process.vehicle",
  "vehicle": {
    "id": "veh-20261013-031", "stage": "identified",
    "plate": "12가 3456", "companyName": "한빛자원", "sectorId": "tank-a1",
    "stageTimes": { "arrived": "2026-10-13T05:20:02.000Z", "identified": "2026-10-13T05:20:09.500Z" },
    "updatedAt": "2026-10-13T05:20:09.500Z"
  }
}

// process.batch — stage: planned → mixing → compressing → completed
{
  "type": "process.batch",
  "batch": {
    "id": "batch-0412", "stage": "compressing",
    "mix": [ { "sectorId": "tank-a1", "percent": 40 }, { "sectorId": "tank-b2", "percent": 60 } ],
    "avgMoisturePercent": 11.8,
    "targetPressureMpa": 28.5,
    "stageTimes": { "planned": "...", "mixing": "...", "compressing": "..." },
    "updatedAt": "..."
  }
}

// process.bale — stage: created(결속 후 배출) → shipped
{
  "type": "process.bale",
  "bale": {
    "id": "BL-20261013-0412", "batchId": "batch-0412", "stage": "created",
    "stageTimes": { "created": "..." },
    "updatedAt": "..."
  }
}

// GET /process/state
{ "vehicles": [ ... ], "batches": [ ... ], "bales": [ ... ], "updatedAt": "..." }
```

- `plate`, `companyName`, `sectorId`는 `arrived` 단계에서는 `null`이고 `identified`부터 채워진다. `sectorId`는 기존 탱크 기기 ID(`tank-a1` 등)를 그대로 쓴다. 섹터와 탱크는 같은 대상이다.
- `targetPressureMpa`는 이 배치에 서버가 지정한 목표 압력이다. 실제 압력은 기존 압축기 상태의 `pressureMpa`를 그대로 쓴다.
- 로봇이 어느 섹터에서 집는지는 기존 `robot.joints`와 로봇 상태의 `targetTankId`를 따른다. 화면이 배합비로 집는 순서를 계산하지 않는다.
- 사건으로 표현하면 아래 `stage` 전이에 대응한다.

| 사건 | 메시지와 `stage` |
| --- | --- |
| `vehicle.arrived` / `vehicle.identified` | `process.vehicle`의 `stage`: `arrived` / `identified` |
| `unload.started` / `unload.completed` | `process.vehicle`의 `stage`: `unloading` / `unloaded` (출차는 `departed`) |
| `batch.planned` | `process.batch`의 `stage`: `planned` (배합 시작은 `mixing`) |
| `compress.started` / `compress.completed` | `process.batch`의 `stage`: `compressing` / `completed` |
| `bale.created` / `bale.shipped` | `process.bale`의 `stage`: `created` / `shipped` |

기존 형식에는 필드 세 개를 더한다.

| 대상 | 추가 필드 | 설명 |
| --- | --- | --- |
| 탱크 상태 | `grade`: `"A"` 또는 `"C"` | 섹터의 등급. 수분은 기존 `moisturePercent` |
| `plant.summary` | `balesToday` | 오늘 처리량(베일 수) |
| `plant.summary` | `compressorUptimePercent` | 압축기 가동률 % |

화면에서의 약속은 다음과 같다.

- 트럭·지게차·작업자의 경로와 속도는 화면 연출이고 센서 값이 아니다. 움직임은 받은 `stage`를 따라가기만 하며, 다음 `stage`가 먼저 오면 연출을 줄여 맞춘다.
- 연결 끊김(15초)에는 로봇뿐 아니라 트럭·지게차·컨베이어·압축기·작업자까지 모두 멈추고, 복구되면 `GET /process/state`로 받은 상태에 맞춰 다시 놓는다(지나간 구간을 재생하지 않는다).
- 하단 공정 추적(입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하)의 시각은 `stageTimes`를 표시만 한다. 차량·배치·베일을 하나의 사이클로 묶는 값은 서버에 없으므로 "출차하지 않은 가장 최근 차량, 진행 중인 배치, 가장 최근 베일"을 나란히 보여 준다.
- 값이 모의 서버나 로컬 시연 소스에서 오면 화면에 "예시 데이터" 표시를 띄운다.

### 5단위 배치·베일 계약 (2026-10-15, 현장 확인 전 가정)

`/records/batches`: 현재·다음 배치 선택, 수동 제어, 사건 RecordList. `/records/batches/{id}`: 과거 상세. `/records/bales/{id}`: 베일 상세.
- GET `/batches/control`: `{current,next,pressureRange,eventsRevision}`. 각 대상은 `{batch,paused,skipped,progressPercent,currentPressureMpa,baleIds}`. 진행률·압력·현재/다음 선정은 서버가 결정한다. 화면은 2초마다 조회하며 재연결 때 재조회한다.
- GET `/batches/events/records`: 공통 기간·페이지 계약의 `BatchEvent` 목록. created, mix_changed, pressure_changed, paused, resumed, skipped, bale_produced. 시각·배치 ID·행위자·변경 전후/사유/베일 ID를 저장한다.
- GET `/bales/{id}`: 베일 ID, 배치 ID, 생성·출하 시각, 상태, 실제 압력, 평균 수분, 배합 스냅샷.
- POST `/devices/compressor-1/commands`: `set_batch_mix {batchId,mix}`, `set_batch_pressure {batchId,targetPressureMpa}`, `pause_batch {batchId}`, `resume_batch {batchId}`, `skip_batch {batchId,reason}`. 모두 `confirm:true`, Idempotency-Key, `batch.control` 권한 필수. admin만 권한 부여하는 가정.
- 202는 적용 대기. command.result completed는 적용됨, rejected는 거부됨. WS 누락 시 기존 GET 명령 조회 사용. 서버 확정 전 표시값을 바꾸지 않는다.
- 구조 오류·확인 누락 422, 권한 없음 403. 실행 시 배치 종료/단계 변경·배합 합계 오류·압력 범위 위반·이미 정지/재개 상태는 command.result rejected. 배합은 투입 전, 압력은 압축 전만 변경 가능. 압축 중 건너뛰기 거부. 사유는 공백 제외 1~120자. 압력 허용 범위는 서버 fixtures에서 제공한다.

## 확인 상태와 프로토타입 가정

대표님과 현장 책임자와 대화하기 전까지는 아래 가정으로 프로토타입을 만들고, 답을 받는 대로 고친다. 확인된 항목은 체크했고, 가장 먼저 필요한 것은 서버 담당과 API 명세 합의다.

**대표님에게**

- [x] 현장 밖에서도 접속해야 함 → 필요하며 로그인으로 접속을 보호한다
- [x] 자동 운전은 서버가 처리하고 대시보드에서는 사람이 수동으로 조작할 수 있게 한다
- [x] 태블릿 기종은 제한 없음, 동시 접속은 회사 내부 관계자 소수
- [ ] 로봇·센서 데이터를 처리하는 서버는 누가 만들고, 지금 있는지 앞으로 만드는지
- [ ] API 명세와 서버 일정이 언제 나오는지
- [ ] 대시보드에서 하고 싶은 수동 조작 목록 (현재 가정은 아래 표)
- [ ] 권한 종류(관리자, 작업자, 열람자 등)와 권한별로 보이는 화면·조작
- [ ] 홈에 항상 보여야 하는 수치와 이상 기준값 (현재 가정: 적재율 80% 이상 주의)
- [ ] 압축기 이후 공정과 기기 목록 (5단계 확장 범위)
- [ ] 현장 카메라 종류(IP 카메라 또는 녹화 장비)

**서버 담당자에게**

- [ ] 로그인, 토큰 발급, 요청마다 권한 검증이 가능한지 (안 되면 얇은 게이트웨이를 누가 만드는지)
- [ ] 자동 로그인: 리프레시 토큰 쿠키(HttpOnly·Secure·SameSite·Path), 앱용 본문 전달, 교체·재사용 감지, 로그아웃 폐기를 6절 "토큰 보관과 자동 로그인"대로 구현할 수 있는지
- [ ] 현장 밖 접속을 받는 서버의 보안 설정: HTTPS, 로그인 시도 횟수 제한, 접속·조작 기록, 필요하면 VPN 병행
- [ ] 수동 조작을 받으면 서버가 자동 운전을 어떻게 멈추고 넘겨주는지, 현장 안전 장치와 어떻게 연동되는지
- [ ] 관절 각도와 그리퍼 값을 초당 10\~20회로 제공할 수 있는지 (안 되면 진행률 방식)
- [ ] 로봇 기종, 축 수, 각도 단위와 영점, 링크 길이(사양서나 URDF)
- [ ] 탱크 부피(용량) 값을 센서에서 직접 받는지 수위에서 계산하는지
- [ ] 알람을 FCM으로 발송해 줄 수 있는지
- [ ] CCTV RTSP를 HLS나 WebRTC로 변환하고 서명 주소를 발급해 줄 수 있는지
- [ ] 상태 종류(`status`, `phase`)와 기준값 정의, 시각이 어떤 기준(UTC)인지
- [ ] 현장에 물리 비상정지 버튼이 있는지

### 프로토타입 가정

대화가 가능해질 때까지 아래 가정으로 만들고, 가정이 바뀔면 오른쪽 열의 부분만 고친다. 프로토타입을 보낼 때 이 표를 함께 전달한다.

| 항목 | 현재 가정 | 바뀔 때 고칠 곳 |
| --- | --- | --- |
| 서버 | 이 문서의 API 명세를 따르는 서버가 있다. 없으면 모의 서버로 동작 | API 경로와 값 형식 |
| 로봇 기종 | 범용 6축 로봇팔, 링크 길이와 축은 설정값 | 설정값 교체, 구조가 크게 다르면 로봇 모델 재작성 |
| 권한 | `admin`, `operator`, `viewer` 세 종류 | 권한 이름과 화면 분기 |
| 수동 조작 | 시작, 일시정지, 재개, 정지, 수동 모드 전환, 탱크 지정 집기, 설정 변경 | 명령 목록과 위험도 분류 |
| 이상 기준 | 적재율 80% 이상이 주의, 서버가 `status`로 판정해 전달 | 기준값은 서버 설정이고 화면은 `status`만 표시 |
| 장면 구성 | 게이트·계중대, 섹터(탱크) 4개, 로봇팔 1개, 긴 컨베이어 1개(Section Z), 압축기 1개, 출하장 | 3D 장면 배치 |
| 태블릿 | 기종 제한 없음, 화질 3단계를 자동 선택하고 가장 낮은 단계가 저사양 안전판 | 단계별 연출 수준 |
| 접속 | 현장 밖 포함, 로그인으로 보호 | 서버 보안 설정, VPN 병행 여부 |
| 자동 로그인 | 웹은 HttpOnly 쿠키, 안드로이드는 보안 저장소에 리프레시 토큰을 두고 앱 시작 때 리프레시로 세션을 되살린다. 자동 로그인 14일, 아니면 브라우저·앱을 닫을 때까지 | `shared/auth.ts`, `app/src/api/tokens.ts`, 모의 서버 `auth.ts` |
| 카메라 | 카메라 1대 이상, HLS 우선 | 영상 방식 |
| 알림 | 앱이 켜져 있으면 WebSocket, 닫혀 있으면 FCM | 서버가 FCM을 못 보내면 앱이 켜져 있을 때만 알림 |
| 수납 섹터 | 섹터는 A1, A2, B1, B2 네 개이고 기존 탱크 4개와 같은 대상(기기 ID 그대로) | 기기 ID 목록, 장면 배치 |
| 섹터 등급 | 등급은 A와 C 두 가지, 섹터마다 서버가 등급과 수분을 알려 준다 | `shared/`의 등급 타입, 표시 문구 |
| 계중대와 무게 | 차량·하역 기록에만 계중대 순중량(t, 총중량 − 공차, 세 값 모두 저장)을 쓴다. 섹터는 적재율·부피, 로봇 집기는 부피 또는 횟수. 실시간 장면의 계중대는 진행 표시만 한다 | 기록 형식(`shared/`), 기록 화면의 표시 단위, `app/src/config/display.ts` |
| 배치·베일 제어 | 배치당 베일 1개 목업, 모델 1→N. `batch.control`은 관리자만. 투입 전 배합·압축 전 압력 변경, 압축 중 건너뛰기 거부 | `shared/commands.ts`, `mock-server/src/fixtures/accounts.ts`, `mock-server/src/sim/process.ts` |
| 기록 목록 | 모든 기록 목록은 `from`·`to`·`page`·`pageSize` 쿼리와 `{ items, total, page, pageSize }` 응답, 한 쪽 10줄 | `shared/records.ts`, 모의 서버 `routes/records.ts`, `components/records` |
| 섹터 하역 기록 | `GET /devices/{id}/unloads/records`, 줄마다 번호판·회사·총중량·공차·순중량(t)·하역 전후 적재율. 섹터 상태에 지금의 주의 기준 `cautionThresholdPercent` | `shared/records.ts`·`devices.ts`, 모의 서버 `sim/unloads.ts`, `features/tank` |
| 공정 기록 | `GET /vehicles/records`·`GET /batches/records`(기록 목록 모양)와 한 건 조회 `GET /vehicles/{id}`·`GET /batches/{id}`. 차량: 입·출차 시각, 번호판, 회사, 배정 섹터, 총중량·공차·순중량, 상태(인식·하역·출차). 배치: 시작·종료, 배합, 평균 수분, 목표·실제 압력, 결과(완료·건너뜀·일시정지됨), 만든 베일. 지난 30일 | `shared/processRecords.ts`, 모의 서버 `sim/records.ts`, `features/records` |
| 차량·회사·섹터 배정 | 번호판 → 회사 → 배정 섹터는 서버가 정해 보낸다. 모의 서버는 가상의 회사(한빛자원, 동해페이퍼, 새솔리싸이클)와 가상의 번호판을 쓴다 | 모의 서버 예시 데이터 |
| 배합과 압력 | 배치별 배합비·평균 수분·목표 압력은 서버가 정해 보낸다 | 모의 서버 예시 데이터 |
| 공정 흐름 형식 | 6절 "공정 흐름"의 `process.*` 메시지와 `GET /process/state` | API 경로와 값 형식 |

## 위험과 대응

가장 큰 위험은 서버 담당과 일정이 정해지지 않은 것이고, 그 다음이 실제 태블릿에서의 3D 성능과 화면이 실제 로봇 상태와 어긋나는 문제다.

| 위험 | 대응 |
| --- | --- |
| 서버 담당·일정 불명확 | 7절의 확인 상태로 관리하고 범위를 문서로 남긴다. 모의 서버로 서버 일정과 무관하게 개발한다. |
| 3D 성능(렉, 발열) | 화질을 3단계로 나누고 가장 낮은 단계는 불투명 저폴리, 줄인 오브젝트 수, 미리 그린 그림자만 쓴다. 움직임이 없으면 그리기를 멈추고, CCTV나 다른 화면이 열리면 그리기 루프를 정지한다. 실제 태블릿에서 먼저 확인하고 여유가 있을 때만 연출을 추가한다. |
| 화면과 실제 로봇의 어긋남 | 시각(`ts`)과 순서(`seq`)를 받아 0.1\~0.2초 지연 버퍼로 부드럽게 그린다. 값이 안 오면 팔을 멈추고 “연결 끊김”과 마지막 수신 시각을 표시한다. 이상 상황의 최종 확인은 CCTV와 상태 표시로 한다. |
| 로봇 기종 미정 | 범용 로봇팔 모델로 시작하고 링크 길이·축·단위·영점을 설정값으로 분리해 기종이 정해지면 설정만 바꾼다. 굴착기 같은 다른 구조면 새로 그린다. |
| 위험 조작 | 권한과 실행 가능 여부는 서버가 매 요청마다 검증한다. 위험도가 높은 명령은 기기 페이지와 확인 단계를 거친다. 비상정지는 물리 버튼이 담당하고 앱 알림에만 의존하지 않는다. |
| 장시간 구동 | 새벽 자동 새로고침, 메모리·재연결 장시간 테스트, 태블릿 충전기 연결과 화면 꺼짐 끄기. |
| 안드로이드 개발자 인증 정책(배포) | 구글이 설치 전 개발자 등록을 요구하는 정책의 한국 적용 시점을 배포 전에 확인하고, 필요하면 등록을 한다. 대안으로 웹(PWA) 배포를 준비한다. |
| 시안 이미지와 실제 구현의 차이 | 이미지 생성 시안은 배치와 분위기 참고용이며 깨진 글자는 실제 구현에서 정확히 넣는다. 대표님께는 실제로 돌아가는 시안을 보여 기대를 맞춘다. |
| 현장 밖 접속과 원격 수동 조작 | 로그인만으로 보호하면 보안 수준이 서버 설정에 달려 있다. HTTPS, 로그인 시도 제한, 접속·조작 기록, 요청마다 권한 검증, 위험 명령 재인증을 서버 담당과 합의하고 VPN 병행은 열어 둔다. 물리 비상정지와 안전 인터록은 앱·네트워크와 무관하게 동작해야 한다. |
| 확인 전 가정으로 개발 | 프로토타입 가정 표를 시안과 함께 전달해 어긋난 부분을 일찍 찾는다. 가정에 의존하는 값(권한 종류, 기준값, 조작 목록)은 설정으로 분리해 쉽게 바꾼다. |


### 로봇팔 6단위: 섹터 지정 자동 및 집기 기록
- `auto`는 배치 계획을 따르고 `manual`은 `pick_from` 한 번에 한 사이클만 실행한다. `auto_pinned`(자동 · 섹터 지정)은 배합 순서 대신 지정한 섹터만 순환한다. 배합 가능한 배치가 없거나 일시정지되면 대기하며 제외·빈 섹터는 건너뛴다.
- 예: `{ "type": "set_mode", "mode": "auto_pinned", "pinnedSectors": ["tank-a1", "tank-b1"], "confirm": true }`. 섹터는 중복 없는 유효 ID 1~4개(위반 422). 다른 모드에는 pinnedSectors를 보내지 않는다. 같은 지정 모드에서 섹터 변경 가능. `auto`·`manual` 전환은 지정을 해제한다.
- 기존 `robot.manual` 권한·높은 위험도·기기 페이지 확인 단계를 적용한다(현재 가정: 관리자 허용, 작업자·열람자 403). 기존 202 → command.result/GET 결과 흐름과 멱등 키를 사용하며 실행 시 상태도 다시 검사한다.
- 로봇 상태에 `pinnedSectors: TankId[]`, `pickRecordsRevision: number`를 추가한다. 지정 모드 외에는 빈 배열. 화면은 서버 확정값과 편집 초안을 구분하고 적용된 섹터·다음 사이클부터 적용·일반 자동 복귀를 안내한다. 진행 중 사이클은 시작 당시 모드·섹터로 마친다.
- `GET /robots/robot-1/picks/records?from&to&page&pageSize` → 공통 `RecordPage<PickRecord>`. 필드: `id`, `pickedAt`(놓기 완료 UTC), `mode`(사이클 시작 당시), `sectorId`, `volumeM3`(실제 집은 부피), `conveyorId`(`conveyor-z`), `batchId`(투입 배치, 없으면 null). 성공적으로 놓은 건만 저장한다. 사이클 시작 때 배치를 기억하고 도중에 건너뛴 배치는 다른 배치로 귀속하지 않는다.
- 페이지 맨 아래 별도 RecordList로 시각·모드·섹터·m³·컨베이어 → 배치 ID를 표시한다. 기존 사이클 통계는 그대로 유지한다. 새 기록 revision으로 같은 기간·쪽을 갱신하고 연결 끊김 시 받은 줄을 유지한다.
