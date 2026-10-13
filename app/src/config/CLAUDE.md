# app/src/config — 설정값 (가정에 의존하는 값의 집합소)

명세 7절 "프로토타입 가정"이 바뀔 때 고칠 곳이 대부분 여기다. 코드 곳곳에 숫자·목록을 박지 않고 이곳에 모은다.

## 파일

1단계에서 만든 것: `env`, `robotModel`, `controls`, `display`, `navigation`, `realtime` (각 `*.test.ts` 포함). 2단계(3D 홈)에서 만든 것: `sceneLayout`, `quality` (검증은 `scene/scene.logic.test.ts`).

| 파일 | 내용 | 바뀌는 계기 |
| --- | --- | --- |
| `env.ts` | `API_BASE`, `WS_BASE`, `USE_MOCK` — `import.meta.env`를 읽는 유일한 곳 | 실서버 연동(3단계) |
| `robotModel.ts` | 범용 6축 로봇팔 기본값: 관절 순서, 링크 길이, 축 방향, 각도 범위, 영점, 단위 | 로봇 기종 확정 시 `/robots/{id}/model` 값으로 덮어씀 |
| `sceneLayout.ts` | 방·로봇팔·컨베이어 Section Z·압축기 위치와 치수, 탱크가 놓이는 관절 각도(`TANK_BASE_DEG`), 시연 동작 주기, 카메라 방향·기기별 확대 배율, 핀 높이 | 장면 구성 변경 |
| `quality.ts` | 화질 3단계(high/standard/low): 최대 fps, 해상도 배율, 그림자 방식, 빛 번짐, 패널 블러, 소품 수준, 파지 조각 수 상한, 자동 선택 기준(`tierFromProbe`) | 실기기 테스트 결과 |
| `controls.ts` | 화면에 보일 조작 목록과 위치(홈/기기 페이지) — 위험도·권한 표는 `shared/commands.ts`를 참조 | 대표님 조작 목록 확정 |
| `display.ts` | 상태 문구·기호, 표시 형식(소수점 자리, 단위 표기), 기기 표시 이름, 단계 바 구성 (색 토큰은 `styles/index.css`) | 디자인 피드백 |
| `navigation.ts` | 사이드바 메뉴와 메뉴별 필요 권한(`requires`), 여백 없이 가득 쓰는 화면(`fullBleed`) | 대표님 권한별 화면 확정 |
| `realtime.ts` | 끊김 감지 15초, 관절 지연 버퍼 0.15초, store 반영 묶음 주기 | 실서버 특성 |

## 규칙

- 이상 기준값(예: 적재율 80% 주의)은 **서버 설정**이다. 여기에는 판정 로직을 두지 않는다. 표시에만 쓰는 참고값이 필요하면 "표시용"이라고 이름에 드러낸다.
- 로봇 모델은 기본값 → 서버 `/robots/{id}/model` 순으로 덮어쓴다. 구조가 크게 다른 로봇(굴착기형 등)이면 설정만으로 해결하지 말고 `scene/objects/RobotArm`을 새로 만든다.
- `robotModel.ts`의 `DEFAULT_JOINT_RENDER`(관절별 그리기 축·방향)는 서버 모델에 없는 앱 쪽 가정이다.
- `sceneLayout`의 `TANK_BASE_DEG`와 `DEMO_CYCLE`은 모의 서버(`mock-server/src/sim/robot.ts`)의 관절 값과 같아야 한다. 탱크 위치는 이 각도에서 로봇이 집으러 내려간 자리로 계산한다(`scene/layout.ts`). 한쪽만 바꾸면 팔이 탱크 밖을 집는다.
- 값마다 단위를 이름이나 주석에 적는다(`linkLengthsM`, `maxFps`).
- 이 폴더의 값은 상수 데이터와 작은 순수 함수만. React·store import 금지.
