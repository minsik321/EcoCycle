# app/ — 대시보드 웹앱 + 안드로이드 빌드

React + TypeScript + Vite 웹앱이다. 브라우저에서 먼저 확인하고, Capacitor로 안드로이드 앱(태블릿 우선)을 만든다.

## 예정 구조

```
app/
├── index.html
├── vite.config.ts
├── capacitor.config.ts
├── .env.example          VITE_API_BASE, VITE_WS_BASE, VITE_USE_MOCK
├── public/               아이콘, 장면용 작은 텍스처(미리 그린 바닥 그림자 등)
├── android/              `npx cap add android`로 생성 — 미리 만들지 않는다
└── src/
    ├── main.tsx, App.tsx, routes.tsx
    ├── api/  realtime/  store/  config/  components/  features/  scene/
    └── styles/
```

`src/` 하위 폴더마다 CLAUDE.md가 있다.

## 의존 방향

```
features ─► components ─► (store, api 훅)
features/home ─► scene ─► config, realtime(jointBuffer), store(선택자)
store ─► api, realtime, shared        api, realtime ─► shared (store를 import하지 않는다)
```

- `api`·`realtime`은 값을 콜백(`setAuthLostHandler`)과 `RealtimeSink`로 내보내고, `store`가 이를 구현해 연결한다 (`docs/decisions.md`).
- `scene`은 `features`를 import하지 않는다. `api`·`realtime`은 React 컴포넌트를 import하지 않는다.
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
- 실기기: 가장 낮은 사양 태블릿에서 30분 이상(2단계), 하루 이상(4단계) 구동. 프레임, 발열, 메모리, 재연결을 기록한다.

## 하지 말 것

- 토큰을 URL·localStorage에 두지 않는다(WebSocket은 1회용 티켓 사용).
- 시크릿·서버 주소를 코드에 하드코딩하지 않는다(`.env`, `.env.example`만 커밋).
