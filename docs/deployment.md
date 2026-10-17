# Vercel 프런트엔드 / Render 모의 서버

Node.js 24 LTS를 쓴다(`.node-version`). 저장소가 npm workspace라서 두 서비스 모두 **저장소 루트**에서 설치·빌드한다.

## 환경값은 어디에 두나

| 곳 | 무엇 | 배포에 올라가나 |
| --- | --- | --- |
| `mock-server/.env` | 로컬에서 모의 서버를 돌릴 때의 값 (`.env.example`을 복사) | 아니요 (`.gitignore`) |
| `app/.env` | 로컬 개발용 앱 주소 | 아니요 (`.gitignore`) |
| Render의 Environment | 배포한 모의 서버의 값 | 플랫폼이 넣어 준다 |
| Vercel의 Environment Variables | 배포한 앱의 값 (빌드에 들어간다) | 플랫폼이 넣어 준다 |

- 서버는 시작할 때 `mock-server/.env`가 있으면 읽지만, **이미 설정된 환경변수(셸·Render)를 덮어쓰지 않는다**(`process.loadEnvFile`). 그래서 배포 값은 Render Environment에만 넣고 `.env`는 건드리지 않는다. `.env`는 배포되지도 않는다.
- 서버 환경값을 바꾸면 서버를 다시 시작한다(Render는 저장하면 다시 배포한다).
- `API_BASE_PATH`·`WS_PATH`를 바꾸면 앱의 `VITE_API_BASE`·`VITE_WS_BASE`도 같은 경로로 맞춘다. 리프레시 쿠키 경로는 API 경로를 따라 자동으로 바뀐다.

## 로컬

서버 `npm run mock`, 앱 `npm run dev:app` (둘 다 `npm run dev`). 환경 처리 점검: `npm run check:env -w @ecocycle/mock-server`.

## Render (모의 서버)

- Web Service, Root Directory: 저장소 루트(비워 둠)
- Build Command: `npm ci --include=dev`
- Start Command: `npm run start -w @ecocycle/mock-server`
- Health Check Path: `/healthz` (로그인 없이 200)
- Environment:

```dotenv
CORS_ORIGINS=https://YOUR-APP.vercel.app
REFRESH_COOKIE_SAMESITE=none
```

선택: `HOST`(기본 `0.0.0.0`), `API_BASE_PATH`(기본 `/api/v1`), `WS_PATH`(기본 `/ws/v1/stream`), `REFRESH_REUSE_GRACE_SEC`(기본 30). `PORT`는 Render가 정하므로 넣지 않는다.

- `CORS_ORIGINS`: 앱의 실제 주소(끝 `/`와 경로 없이). 여러 개면 쉼표로. Vercel Preview 주소로도 열 거면 그 주소도 넣는다. 비워 두면 로컬 주소만 허용되어 배포 앱에서 로그인이 막힌다.
- `REFRESH_COOKIE_SAMESITE=none`: 앱(vercel.app)과 서버(onrender.com)가 다른 사이트라서 자동 로그인 쿠키가 오가려면 필요하다(Secure·Partitioned가 함께 붙는다). Safari처럼 제3자 쿠키를 막는 브라우저에서는 자동 로그인이 안 될 수 있다(로그인은 된다). 실서버는 앱과 같은 사이트(예: `app.회사도메인`·`api.회사도메인`)에 두면 `lax`로 충분하다.
- HTTP와 WebSocket은 같은 포트로 나가고, HTTPS·WSS는 Render가 처리한다.
- 무료 인스턴스는 한동안 요청이 없으면 잠든다. 깨어나는 데 30초~1분 걸리고, 모의 데이터와 로그인 세션은 메모리에만 있어서 다시 시작하면 처음부터다(로그인 화면으로 돌아간다).

## Vercel (앱)

- Root Directory: 저장소 루트(비워 둠)
- 설치·빌드·출력·주소 되돌리기(직접 주소 진입 시 `index.html`)는 저장소 루트의 `vercel.json`에 있다: Install `npm ci`, Build `npm run build`, Output `app/dist`. Framework Preset은 Other(또는 Vite)로 두고 화면의 값은 비워 둔다.
- Environment Variables:

```dotenv
VITE_API_BASE=https://YOUR-SERVER.onrender.com/api/v1
VITE_WS_BASE=wss://YOUR-SERVER.onrender.com/ws/v1/stream
VITE_USE_MOCK=true
```

`VITE_*` 값은 빌드에 들어가므로 바꾸면 다시 배포한다. `VITE_USE_MOCK=true`는 "예시 데이터" 표시를 켠다(모의 서버를 쓰는 동안 그대로 둔다).

## 배포 순서

1. Render에 서버를 먼저 만들고 주소(`https://….onrender.com`)를 받는다. 이때 `CORS_ORIGINS`는 임시로 비워 둬도 된다.
2. Vercel에 앱을 만들면서 위 `VITE_*`에 Render 주소를 넣고 배포해 앱 주소를 받는다.
3. Render의 `CORS_ORIGINS`에 앱 주소를 넣고 저장(다시 배포).
4. 확인: `https://….onrender.com/healthz`가 `{"ok":true}`, 앱에서 로그인(`admin` / `1234`), 새로고침해도 화면이 유지되는지, 상단의 연결 상태가 "연결됨"인지.

공식 문서: [Render Web Services](https://render.com/docs/web-services), [Render 환경변수](https://render.com/docs/configure-environment-variables), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
