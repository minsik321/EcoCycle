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
