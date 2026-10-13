# EcoCycle — 스마트 폐지 처리 대시보드

파지 선별·압축 설비(탱크 4개, 로봇팔, 컨베이어 Section Z, 압축기)를 한 화면에서 보고 수동 조작하는
**안드로이드 태블릿 우선 대시보드**의 프론트엔드 프로젝트다.
React 웹으로 만들고 Capacitor로 안드로이드 앱을 빌드한다. 서버·로봇·센서·AI는 다른 담당이 맡는다.

## 기준 문서 (가장 먼저 읽을 것)

- `docs/dashboard-spec.md` — 개발 플랜과 API 명세의 **단일 기준**. 화면 구성, API, 권한, 성능 원칙, 개발 단계가 모두 여기 있다.
- `docs/decisions.md` — 명세에 없는 구조·기술 결정과 그 이유.
- 구현이 명세와 달라져야 하면 코드를 먼저 바꾸지 말고, 명세 수정안을 사용자에게 먼저 제안한다.

## 폴더 구조

```
EcoCycle/
├── CLAUDE.md              ← 이 파일: 전체 규칙과 흐름
├── docs/                  기준 문서, 결정 기록, 확인 상태
├── shared/                API 계약 타입 (app과 mock-server가 함께 import)
├── mock-server/           서버 준비 전 가짜 센서·관절 값을 흘리는 개발용 서버
└── app/                   React + Vite 웹앱, Capacitor 안드로이드 빌드
    └── src/
        ├── api/           REST 클라이언트, 인증·토큰 갱신, 명령 전송
        ├── realtime/      WebSocket 연결·구독·끊김 감지, 관절 값 버퍼
        ├── store/         앱 상태(Redux Toolkit) — 저빈도 값만
        ├── config/        로봇 모델·장면 배치·화질 모드·환경값 (가정에 의존하는 값)
        ├── components/    공용 UI, 재사용 조작 컴포넌트
        ├── features/      화면 단위: 로그인, 홈, 기기 페이지, 알람, 설정, CCTV
        └── scene/         홈 3D 장면 (react-three-fiber)
```

각 폴더의 `CLAUDE.md`에 그 폴더의 책임과 규칙이 있다. 폴더 안에서 작업할 때는 그 파일을 먼저 읽는다.

## 데이터 흐름

```
[현장 설비] → [서버: 수집·권한 검증·명령 차단]  (개발 중에는 mock-server가 대신)
        │ REST(조회·명령)              │ WebSocket 1개(실시간)
        ▼                              ▼
   app/src/api  ──────────────  app/src/realtime
        │                         │            │
        │            저빈도 값(상태·알람·요약)   고빈도 값(robot.joints, 초당 10~20회)
        ▼                         ▼            ▼
              app/src/store (Redux)      jointBuffer (store 밖, 보간)
                    │                          │
          features/ (2D 화면)  ◄──────────►  scene/ (3D 홈, RobotArm)
                    │
   조작: components/controls → api 명령(POST + Idempotency-Key) → 202 accepted
         → WebSocket command.result (못 받으면 GET /commands/{id}) → 결과를 홈에서도 표시
```

## 전체 공통 규칙 (모든 폴더에 적용)

1. **권한은 서버가 판단한다.** 프론트는 `GET /me`의 `permissions`로 버튼 표시·비활성만 정한다. 비활성 버튼은 편의 기능일 뿐 차단 수단이 아니다.
2. **위험 조작은 기기 페이지에서만.** 홈·확대 화면은 시작/일시정지/재개/정지/알람 확인만. `set_mode`, `pick_from`, `update_setting`은 기기 페이지 + 확인 단계(`confirm: true`)를 거친다.
3. **비상정지는 앱의 일이 아니다.** 물리 버튼과 현장 안전 인터록이 담당한다. 앱에 "비상정지"를 안전 수단처럼 보이게 만들지 않는다.
4. **연결 끊김을 숨기지 않는다.** 15초간 메시지가 없으면 "연결 끊김"과 마지막 수신 시각을 표시하고 로봇팔을 멈춘다. 마지막 값을 정상처럼 계속 보여 주지 않는다. 복구되면 REST로 현재 상태를 다시 받는다.
5. **값 규칙:** 시각은 ISO 8601 UTC 문자열(표시할 때만 현지 시각), 단위는 %·m³·MPa·°C·도. **무게는 쓰지 않는다**(부피·용량만). 상태 판정(`status`)은 서버가 하고 화면은 표시만 한다.
6. **기기 ID는 고정:** `tank-a1`, `tank-a2`, `tank-b1`, `tank-b2`, `robot-1`, `conveyor-z`, `compressor-1`.
7. **가볍게 만든다.** 화려한 연출보다 실제 저사양 태블릿에서 끊김 없이 도는 것이 우선이다(성능 원칙은 `app/src/scene/CLAUDE.md`).
8. **가정에 의존하는 값은 설정으로 분리한다.** 권한 종류, 기준값, 조작 목록, 로봇 링크 길이·축 등은 코드에 박지 않고 `app/src/config`에 둔다.
9. **API 형식이 바뀌면 순서는 명세 → `shared/` 타입 → mock-server → app.** 타입 오류가 나는 곳이 고칠 곳이다.

## 개발 단계와 흐름

명세 5절의 단계를 따른다. 핵심 기능을 일반 화면으로 먼저 완성하고 3D 홈은 그 위에 얹는다.

| 단계 | 주로 손대는 폴더 | 완료 기준 |
| --- | --- | --- |
| 0. 준비 | docs, shared | 가정 표와 프로토타입 전달, 피드백 수집 |
| 1. 핵심 기능 | shared → mock-server → api, realtime, store → features, components | 권한별 화면 분기와 연결 끊김 표시 동작 |
| 2. 3D 홈 시안 | scene, config, features/home | 실제 태블릿 30fps 안정, 30분 이상 끊김·발열 없음 |
| 3. 실서버 연동 | api, realtime, config(env, robotModel) | 실제 값으로 로봇팔 구동, 끊기면 정지·표시 |
| 4. 장시간·현장 테스트 | realtime, app(빌드·배포) | 하루 이상 구동해도 느려짐·멈춤 없음 |
| 5. 확장 | scene, features | 2단계에서 여유 확인된 경우만 |

**현재 단계: 0 → 1 시작 전.** 단계가 바뀌면 이 줄과 `docs/decisions.md`를 갱신한다.

로봇팔 동기화 후퇴 순서: ① 관절 값 실시간 → ② 단계+진행률 → ③ 정해진 동작 반복(최후).

## 명령어 (1단계에서 만들 예정)

npm workspaces로 `shared`, `mock-server`, `app`을 묶는다.

```bash
npm install                 # 루트에서 한 번
npm run dev                 # mock-server + app 동시 실행
npm run dev:app             # app만 (VITE_API_BASE로 실서버 지정)
npm run mock -- --scenario=disconnect   # 시나리오 지정해 모의 서버 실행
npm run typecheck && npm run test
npm run build:android       # app 빌드 → cap sync android
```

스크립트를 추가·변경하면 이 표도 함께 고친다.

## 작업 방식

- 사용자와는 한국어로 소통한다. 코드 식별자는 영어, 주석·문서는 한국어.
- 작은 단위로 나눠 진행하고, 필요 이상의 추상화를 만들지 않는다.
- 명세의 "확인 필요" 항목(서버 담당, 권한 종류, 로봇 기종 등)을 임의로 확정하지 않는다. 가정으로 진행하고 `docs/dashboard-spec.md`의 프로토타입 가정 표에 맞춘다.
- 하지 않는 것: 서버 기능(로그인 검증, FCM 발송, 영상 변환) 구현, 로봇 AI 학습, 토큰을 URL에 넣기, 투명·발광·유리 재질, 카메라 자유 회전·핀치 확대.
