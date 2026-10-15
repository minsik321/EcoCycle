# app/ — 대시보드 웹앱 + 안드로이드 빌드

React + TypeScript + Vite 웹앱이다. 브라우저에서 먼저 확인하고, Capacitor로 안드로이드 앱(태블릿 우선)을 만든다.

## 예정 구조

```
app/
├── index.html
├── vite.config.ts
├── capacitor.config.ts
├── .env.example          VITE_API_BASE, VITE_WS_BASE, VITE_USE_MOCK
├── public/               아이콘, 장면용 작은 텍스처(미리 그린 바닥 그림자 등), `models/`(3D 홈의 glTF 모델과 라이선스), `studio/`(3D 홈을 준비하는 동안 덮는 포스터)
├── android/              `npx cap add android`로 생성 — 미리 만들지 않는다
└── src/
    ├── main.tsx, App.tsx, routes.tsx
    ├── api/  realtime/  store/  config/  components/  features/  studio/
    └── styles/
```

`src/` 하위 폴더마다 CLAUDE.md가 있다.

## 의존 방향

```
features ─► components ─► (store, api 훅)
features/home ─(lazy)─► studio ─► store, api, realtime(jointBuffer), components/controls, components/layout/shellChrome, config/display·navigation·robotModel·robotCycle (모양에 관한 것은 가져다 쓰지 않는다)
store ─► api, realtime, shared        api, realtime ─► shared (store를 import하지 않는다)
```

- `api`·`realtime`은 값을 콜백(`setAuthLostHandler`)과 `RealtimeSink`로 내보내고, `store`가 이를 구현해 연결한다 (`docs/decisions.md`).
- `features/home`은 `studio`를 lazy로만 불러온다(정적 import 금지: 메인 묶음에 three.js가 들어간다). 예외는 three 없는 `studio/three/stats`와 `studio/preload`(3D 파일 미리 받기·포스터 주소)뿐이다.
  `studio` 안에서도 패널 조각(three 없음)과 3D 조각(`StudioScene`, three)이 나뉜다(`studio/CLAUDE.md` 고정 규칙 1). `studio`는 `features`의 화면을 import하지 않는다(로봇 모델 훅 `useRobotModel`만 예외). `api`·`realtime`은 React 컴포넌트를 import하지 않는다.
- 서버 주소·모의 여부는 `config/env.ts`에서만 읽는다(`import.meta.env`를 여기저기서 읽지 않는다).

## 화면 기준

- 1차 기준은 가로 태블릿(1280×800 전후). 폰은 요약 화면 중심.
- 터치 대상은 최소 48dp. 호버에 의존하는 UI는 만들지 않는다.
- 상태 색은 `normal / caution / alarm / offline` 네 가지를 앱 전체에서 같은 토큰으로 쓰고, 색만으로 구분하지 않도록 아이콘·글자를 함께 쓴다.

## 안드로이드 빌드·배포

- `npm run build && npx cap sync android` 후 Android Studio 또는 Gradle로 APK 빌드.
- 배포는 APK 직접 설치 또는 Firebase App Distribution. 배포 전 구글 개발자 등록 정책의 한국 적용 시점을 확인하고, 대안으로 PWA 배포를 열어 둔다.
- 필요한 네이티브 기능: 푸시(FCM, `@capacitor/push-notifications`), 화면 꺼짐 방지(keep-awake), 토큰 보관(보안 저장소).
- `android/` 아래 생성 파일은 직접 고치지 않는다. 예외: `AndroidManifest.xml`의 권한·설정, 아이콘, `google-services.json`(커밋 금지).

## 테스트

- 단위: Vitest — 리듀서, 선택자, 권한 판단, 관절 보간, 끊김 감지 타이머.
- 화면: React Testing Library — 권한별 버튼 표시, 연결 끊김 표시, 위험 조작 확인 단계.
- 권한: `src/permissions.test.tsx`가 역할(admin·operator·viewer)별로 모든 화면의 버튼 표시·비활성을 한 장의 기준표로 점검한다. 권한 종류가 확정되어 바뀌면 이 표부터 고친다. 화면 코드에서 `role === ...`로 분기하지 않는지도 검사한다.
- 통합: `npm run test:integration` — 모의 서버를 `disconnect` 시나리오로 띄워 앱 전체를 붙이고 연결 끊김(15초 감지, 대시보드 값 "–"·마지막 수신 시각, 3D 홈 무대 정지·끊김 알림·조작 비활성, 관절 값 정지, 명령 결과 조회, 복구 후 재동기화)을 약 1분간 점검하고(3D 무대만 가짜, jsdom에 WebGL이 없어서), 화면이 비활성으로 보여 주는 조작을 서버가 실제로 403으로 막는지(`permissions.integration.test.ts`), 자동 로그인 쿠키 속성·지속/세션 쿠키·교체·재사용 감지(응답을 잃은 경우의 유예, 유예 뒤 폐기)·로그아웃·CORS(`auth.integration.test.ts`, 유예는 3초로 줄여 띄운다)도 확인한다. 이어서 앱(vite)을 띄워 실제 Chromium으로 자동 로그인 → 새로고침·브라우저 다시 열기 → 유지, 로그아웃 → 새로고침 → 로그인 화면, 토큰이 저장소·주소·`document.cookie`에 없는지(`scripts/authReload.mjs`, 새로고침 뒤에는 세션 되살리기가 끝나기를 기다린다) 본다. Chromium이 없으면 `INTEGRATION_SKIP_BROWSER=1`, 안정성을 보려면 `INTEGRATION_BROWSER_RUNS=5`. 오래 걸려 기본 `npm test`에는 넣지 않는다.
- 글 줄바꿈: `npm run test:text`(`scripts/textcheck.mjs`, 점검 함수는 `scripts/textAudit.mjs`) — 모의 서버와 앱을 띄우고 실제 Chromium으로 360×780·390×844·820×1180에서 3D 홈의 펼친 시트(네 탭)·섹터/로봇팔/압축기/컨베이어/차량/베일 상세, 기기 페이지, 기록 목록(`/design/records`), 폰 주 메뉴의 "더 보기", 대시보드를 열어, 12자 이하의 짧은 글이 두 줄로 꺾이거나 낱말이 중간에서 잘리거나 화면이 옆으로 넘치면 실패한다. 글자 100%와 130%(안드로이드 "글자 크기" 설정처럼 글자만 키움) 두 번. 실패한 화면은 `scripts/.textcheck/`에 찍는다. 브라우저를 내려받지 않으므로 `CHROMIUM_PATH` 또는 Playwright 브라우저 폴더가 필요하다. jsdom은 글자 배치를 계산하지 않아 기본 `npm test`에는 CSS 규칙이 빠지지 않았는지만 본다(`styles/text.test.ts`).
- 글 규칙(앱 전체, `styles/index.css`): 한국어는 `word-break: keep-all` + `overflow-wrap: break-word`. 이름표·탭·표 머리·버튼·상태 글은 한 줄, 넘치면 말줄임. 이름·값 줄은 `items-baseline`(또는 `.kv-row`)과 고정 폭 숫자. 폰 표는 칸이 모자라면 덜 중요한 칸을 숨긴다(`DataTable`의 `hideOnNarrow`, 3D 홈 시트의 `st-col-opt`). 좁은 칸의 시각은 `formatLocalClock`.
- 첫 화면 시간: `npm run measure:load`(`scripts/loadtime.mjs`, 도구는 `scripts/browserKit.mjs`) — 프로덕션 빌드를 배포처럼(gzip, `max-age=0, must-revalidate` + ETag) 내주고 모의 서버와 함께, 390×844 폰에 4G(4Mbps·150ms)와 CPU 4배 느림을 걸어 로그인 → 지표 숫자, 로그인 → 3D 첫 장을 잰다. 로그인 화면에 0초·4초 머무는 두 경우, 로그인 전 API 요청 수(0이어야 함), 미리 받은 JS를 또 받았는지. `LOADTIME_APP_DIR`로 다른 코드(이전 커밋)를 같은 조건으로 잰다. 그래픽은 SwiftShader라 3D 첫 장은 실제 폰보다 느리게 나온다. 결과는 `scripts/.loadtime/`.
- 포스터: `npm run poster`(`scripts/poster.mjs`) — `/scene-demo?poster=1`(빈 장면)을 찍어 `public/studio/poster-*.jpg`를 다시 만든다. 화면에 글자가 있으면 멈춘다.
- 실기기: 가장 낮은 사양 태블릿에서 30분 이상(2단계), 하루 이상(4단계) 구동. 프레임, 발열, 메모리, 재연결을 기록한다.

## 하지 말 것

- 토큰을 URL·localStorage·sessionStorage에 두지 않는다(WebSocket은 1회용 티켓, 자동 로그인은 웹 HttpOnly 쿠키·안드로이드 보안 저장소).
- 시크릿·서버 주소를 코드에 하드코딩하지 않는다(`.env`, `.env.example`만 커밋).
