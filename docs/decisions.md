# 결정 기록

명세(`dashboard-spec.md`)에 없는 구조·기술 결정을 남긴다. 최신 항목이 아래로 간다.

## 2026-10-13 프로젝트 폴더 구조 초안
- 결정: npm workspaces로 `shared`(API 타입) · `mock-server` · `app`을 한 저장소에 둔다. 앱 코드는 `api` / `realtime` / `store` / `config` / `components` / `features` / `scene`으로 나눈다.
- 이유: 모의 서버와 앱이 같은 타입을 써야 명세와 어긋나는 곳이 컴파일 단계에서 드러난다. 3D 장면과 2D 화면, 고빈도 관절 값과 저빈도 상태를 분리해야 성능 원칙을 지키기 쉽다.
- 상태: 확정 (2026-10-13 사용자 확인)

## 2026-10-13 언어·도구 선택
- 결정: TypeScript, Vite, Redux Toolkit(앱 상태), react-router, react-three-fiber + drei(최소 사용), 모의 서버는 Node(Express + ws).
- 이유: 명세는 React·Three.js·Capacitor만 정했다. TypeScript는 API 계약을 타입으로 고정하기 위해, Redux Toolkit은 기존에 익숙한 도구라서 선택했다. 관절 값은 Redux에 넣지 않는다(초당 10~20회 갱신이 리렌더를 일으킴).
- 상태: 확정 (2026-10-13 사용자 확인)

## 2026-10-13 스타일링: Tailwind CSS
- 결정: UI 스타일링은 Tailwind CSS를 쓴다.
- 이유: 사용자 선택. 작성 속도가 빠르다. 클래스가 길어지는 곳은 공용 컴포넌트(`components/`)로 묶어 중복을 막는다.
- 상태: 확정 (2026-10-13 사용자 확인)

## 2026-10-13 테스트·차트: Vitest + Recharts
- 결정: 테스트는 Vitest, 이력 그래프와 짧은 추이는 Recharts로 그린다.
- 이유: 사용자 선택. Vite와 Vitest는 설정이 공유된다. Recharts는 데이터 점이 많으면 느려질 수 있으므로 표시 구간을 제한하고(예: 점 수 상한, 필요하면 서버에서 다운샘플) 저사양 태블릿에서 확인한다. 성능 문제가 확인되면 교체를 다시 검토한다.
- 상태: 확정 (2026-10-13 사용자 확인), 성능은 1단계 후 실기기에서 재확인

## 2026-10-13 문서 위치 변경
- 결정: 기존 명세서 파일을 `docs/dashboard-spec.md`로 옮기고 이름을 바꿨다. 내용은 그대로다.
- 상태: 확정

## 2026-10-13 이력 그래프 표시 방식: 구간 단위 넘기기
- 결정: 기기 페이지 이력 그래프는 한 번에 한 구간만 요청해서 그린다. 처음에는 최근 하루(10분 간격)를 보여 주고, 단위를 바꾸면 그 단위로 다시 요청하고, 과거는 스와이프나 `◀ 이전 / 다음 ▶`으로 구간을 통째로 넘겨 새로 요청해 그린다.
- 이유: 그래프는 센서값을 그때그때 보는 용도라 상세할 필요가 없다. 구간마다 점이 수백 개 이하로 유지되어 Recharts로 충분하다. 연속 가로 스크롤은 과거 데이터를 앞에 붙일 때 스크롤 위치가 튀고 Recharts가 끄는 동작을 기본 지원하지 않아 구현 비용이 크다. 명세의 `GET /devices/{id}/history?from&to&interval`을 그대로 쓴다.
- 상태: 확정 (2026-10-13 사용자 확인)

## 2026-10-13 프로토타입 가정의 코드 위치 매핑
- 결정: 명세 7절 "프로토타입 가정" 표의 항목을 아래 위치에 둔다. 가정이 바뀌면 해당 위치만 고친다.

| 가정 | 코드 위치 | 비고 |
| --- | --- | --- |
| 서버 / 모의 서버 전환 | `app/src/config/env.ts` (`API_BASE`, `WS_BASE`, `USE_MOCK`) | `import.meta.env`는 이 파일에서만 읽는다. API 경로·값 형식이 바뀌면 명세 → `shared/` → mock-server → app 순서 |
| 로봇 기종 (범용 6축) | `app/src/config/robotModel.ts` | 기본값 → 서버 `/robots/{id}/model`로 덮어씀. 구조가 크게 다르면 `scene/objects/RobotArm` 재작성 |
| 권한 3종 (`admin`, `operator`, `viewer`) | `shared/`(role·permission 타입), `app/src/config/controls.ts`(화면 분기), mock-server 계정 | 판단은 서버, 프론트는 `permissions`로 표시·비활성만 |
| 수동 조작 목록 | `shared/commands.ts`(종류·위험도·필요 권한), `app/src/config/controls.ts`(화면 위치) | 위험 조작은 기기 페이지 + `confirm: true` |
| 이상 기준 (적재율 80% 주의) | 서버 설정 (mock-server는 `status`를 계산해 전달) | 앱에는 판정 로직을 두지 않는다. 표시용 참고값이 필요하면 `display.ts`에 "표시용" 이름으로 |
| 장면 구성 (탱크 4·로봇 1·컨베이어 1·압축기 1) | `app/src/config/sceneLayout.ts` | 2단계에서 사용 |
| 태블릿 / 저사양 모드 | `app/src/config/quality.ts` | 실기기 테스트 결과로 조정 |
| 접속 (로그인 보호, 현장 밖 포함) | 서버 보안 설정. 앱은 토큰 갱신과 WebSocket 티켓만 (`app/src/api`, `app/src/realtime`) | 토큰은 URL·localStorage에 두지 않는다 |
| 카메라 (1대 이상, HLS 우선) | `app/src/features/cctv`, `shared/`의 `/cameras` 타입 | 영상 변환은 서버 몫 |
| 알림 (WebSocket / FCM) | `app/src/realtime`(앱 켜짐), Capacitor 푸시(2단계 이후) | 서버가 FCM 불가 시 앱 켜짐 때만 |

- 결정: 권한별 `permissions` 임시 매트릭스는 3단계 위계로 한다 (확정 전까지 모의 서버·화면 분기에 사용).

| role | permissions |
| --- | --- |
| `admin` | `robot.control`, `robot.manual`, `settings.write`, `alarm.ack` |
| `operator` | `robot.control`, `alarm.ack` |
| `viewer` | 없음 (조회만) |

- 이유: 위험도 낮은 조작(시작·일시정지·재개·정지·알람 확인)은 작업자에게, 위험도 높은 조작(수동 모드·설정 변경)은 관리자에게만 둔다. 대표님이 권한 종류를 확정하면 이 표와 `config/controls.ts`만 고친다.
- 상태: 가정(확인 필요: 대표님 — 권한 종류와 권한별 화면·조작)

## 2026-10-13 배포 방식: 프로토타입은 Vercel + Render, 이후 Capacitor APK
- 결정:
  - 프로토타입: 프론트(`app` 빌드 결과, 정적 파일)는 Vercel, 목서버(`mock-server`, Node)는 Render에 올린다. 대표님은 태블릿 브라우저로 Vercel 주소에 접속한다.
  - 이후: 같은 프론트 코드를 Capacitor로 감싸 안드로이드 APK로 배포한다(APK 직접 설치 또는 Firebase App Distribution). Vercel 웹 버전은 대안 배포(PWA)로 남긴다.
  - 실서버가 준비되면 목서버를 내리고 프론트의 서버 주소(`VITE_API_BASE`, `VITE_WS_BASE`)만 실서버로 바꿔 다시 빌드·배포한다. 실서버 배포는 서버 담당 몫이다.
- 이유: 실서버가 없는 상태에서도 실제와 같은 REST·WebSocket 경로로 프로토타입을 보여 주고 검증할 수 있다. 프론트는 정적 파일이라 웹 호스팅과 APK에 같은 코드를 쓴다. 나중에 실서버로 옮길 때도 "주소 변경 후 재빌드"라는 같은 절차를 따른다.
- 주의:
  - Render 무료 요금제는 접속이 없으면 잠들어 첫 접속이 느리다. 시연 전에 한 번 열어 깨운다. 재시작하면 목서버 데이터는 처음 상태로 돌아간다.
  - `VITE_*` 값은 빌드 시점에 들어가므로 바꾸면 Vercel 재배포·APK 재빌드가 필요하다.
  - react-router 경로 새로고침용으로 `vercel.json`에서 모든 경로를 `index.html`로 돌린다.
  - 목서버 CORS에 Vercel 주소를 허용하고, APK 단계에서는 Capacitor 앱 주소도 추가한다.
  - 두 주소 모두 공개되므로 회사명·실제 설비 정보는 넣지 않고, 테스트 계정 비밀번호는 실제로 쓰는 것과 다르게 둔다.
- 상태: 확정 (2026-10-13 사용자 확인)


## 2026-10-13 비동기 요청은 createAsyncThunk로 통일
- 결정: store의 비동기 요청(로그인, 명령 전송)은 RTK Query 대신 `createAsyncThunk`로 쓴다.
- 이유: 서버 값은 대부분 WebSocket으로 밀려 오고 REST는 재동기화·이력 조회·명령에만 쓰여서 RTK Query의 캐시·재요청 기능이 거의 필요 없다. 의존성과 개념이 늘지 않는다. 이력 그래프처럼 화면에서만 쓰는 조회는 store에 넣지 않고 화면의 훅에서 api를 직접 부른다.
- 상태: 확정

## 2026-10-13 api·realtime은 store를 import하지 않는다 (의존 방향)
- 결정: `api`와 `realtime`은 `store`를 import하지 않고, 값은 콜백/인터페이스로 내보낸다. `api`는 `setAuthLostHandler`, `realtime`은 `RealtimeSink`를 받고, `store`가 이를 구현해 연결한다(`store/realtimeSink.ts`, `store/bootstrap.ts`). 실시간 연결을 켜고 끄는 `useRealtime`도 `realtime/`이 아니라 `store/`에 둔다.
- 이유: 원래 구조도(`api, realtime ─► store`)는 실시간·REST 코드가 store에 묶여 단위 테스트(가짜 타이머, 가짜 소켓)가 어렵다. 방향을 뒤집으면 순환 없이 각 계층을 따로 테스트할 수 있다.
- 상태: 확정

## 2026-10-13 리프레시 토큰은 웹에서 메모리에만 둔다 (프로토타입)
- 결정: 리프레시 토큰의 기본 저장소는 메모리다. 웹 프로토타입에서는 새로고침하면 다시 로그인해야 한다. 안드로이드 앱에서는 Capacitor 보안 저장소 구현을 `setRefreshTokenStore`로 끼운다.
- 이유: "토큰을 URL·localStorage에 두지 않는다" 규칙. 웹에서 로그인을 유지하려면 `sessionStorage` 등 브라우저 저장소가 필요한데 규칙과 충돌한다.
- 상태: 가정(확인 필요: 서버 담당과 토큰 보관 방식, 사용자에게 웹 프로토타입의 새로고침 재로그인 허용 여부)

## 2026-10-13 CCTV 재생: hls.js를 필요할 때만 불러온다
- 결정: `<video>`가 HLS를 직접 재생하는 기기(안드로이드, 사파리)는 주소를 그대로 쓰고, 못 하는 기기(데스크톱 Chrome 등)에서만 `hls.js`를 동적 import로 불러온다. WebRTC 주소는 아직 지원하지 않고 안내만 한다.
- 이유: 명세는 앱이 서버가 변환해 준 주소를 `<video>`로 재생하기만 한다고 정했다. 안드로이드 태블릿 실사용에서는 기본 재생으로 충분하지만 개발·시연(데스크톱 브라우저)에서는 hls.js가 필요하다. 동적 import라 CCTV를 열기 전에는 번들에 영향이 없다.
- 상태: 확정 (WebRTC는 서버가 제공하면 추가: docs/questions.md B8)

## 2026-10-13 화면 틀은 화면(features)을 직접 import하지 않는다
- 결정: `components/layout/AppShell`은 CCTV 버튼·화면 같은 기능을 직접 import하지 않고 `headerExtra`, `overlays` 슬롯으로 받는다. 라우트(`routes.tsx`)가 끼워 넣는다.
- 이유: 의존 방향 `features ─► components` 유지.
- 상태: 확정

## 2026-10-13 화질 모드는 기기에 기억한다
- 결정: 화질 모드(기본/저사양)는 `localStorage`에 저장하고, 로그아웃으로 앱 상태를 초기화해도 유지한다.
- 이유: 기기마다 성능이 달라 기기 단위 설정이다. 토큰 같은 비밀이 아닌 표시 설정이라 "토큰을 localStorage에 두지 않는다" 규칙과 무관하다. 저장소를 쓸 수 없으면 기본값으로 동작한다.
- 상태: 확정

## 2026-10-13 서버가 제공하지 않는 화면 항목은 만들어 내지 않는다
- 결정: 로봇팔 "사이클 통계", 압축기 "점검 이력", 설정의 "현재 설정값"처럼 명세 화면에는 있지만 API가 없는 항목은 앱이 임의로 계산하거나 지어내지 않고, 안내 문구를 보여 준 뒤 서버 담당 질문으로 남긴다.
- 이유: 실제 설비 상태와 어긋난 값을 보여 주면 안 된다. API가 정해지면 `shared/` 타입부터 추가한다.
- 상태: 가정(확인 필요: 서버 담당, docs/questions.md B18, B21, B22)
