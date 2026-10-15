# app/src/config — 설정값 (가정에 의존하는 값의 집합소)

명세 7절 "프로토타입 가정"이 바뀔 때 고칠 곳이 대부분 여기다. 코드 곳곳에 숫자·목록을 박지 않고 이곳에 모은다.

## 파일

1단계에서 만든 것: `env`, `robotModel`, `controls`, `display`, `navigation`, `realtime` (각 `*.test.ts` 포함). 2단계(3D 홈)에서 만든 것: `quality`, `robotCycle` (3D 배치 자체는 `studio/world/layout.ts`. 옛 `sceneLayout`은 2026-10-14 기존 장면과 함께 삭제).

| 파일 | 내용 | 바뀌는 계기 |
| --- | --- | --- |
| `env.ts` | `API_BASE`, `WS_BASE`, `USE_MOCK` — `import.meta.env`를 읽는 유일한 곳 | 실서버 연동(3단계) |
| `robotModel.ts` | 범용 6축 로봇팔 기본값: 관절 순서, 링크 길이, 축 방향, 각도 범위, 영점, 단위 | 로봇 기종 확정 시 `/robots/{id}/model` 값으로 덮어씀 |
| `robotCycle.ts` | 섹터마다 로봇이 집으러 가는 base 관절 각도(`TANK_BASE_DEG`)와 시연 동작 주기(`DEMO_CYCLE`) | 실제 로봇·섹터 배치 확정 |
| `quality.ts` | 화질 3단계(high/standard/low)의 이름·설명, 자동 선택 기준(`tierFromProbe`). 단계별로 무엇을 그리는지는 `studio/quality.ts` | 실기기 테스트 결과 |
| `controls.ts` | 화면에 보일 조작 목록과 위치(홈/기기 페이지) — 위험도·권한 표는 `shared/commands.ts`를 참조 | 대표님 조작 목록 확정 |
| `display.ts` | 상태 문구·기호, 표시 형식(소수점 자리, 단위 표기), 기기 표시 이름, 단계 바 구성, 기록 목록의 기간 버튼·직접 선택 최대 일수·쪽 번호 수·빈 목록 문구(`RECORD_RANGES`, `RECORD_LIST`) (색 토큰은 `styles/index.css`) | 디자인 피드백 |
| `navigation.ts` | 주 메뉴와 메뉴별 필요 권한(`requires`), 폰 탭 바에 바로 놓을 메뉴(`phoneTab`, 나머지는 "더 보기"), 메뉴 강조 기준(`isNavActive`), 여백 없이 가득 쓰는 화면(`fullBleed`) | 대표님 권한별 화면 확정 |
| `realtime.ts` | 끊김 감지 15초, 관절 지연 버퍼 0.15초, store 반영 묶음 주기 | 실서버 특성 |

## 규칙

- 이상 기준값(예: 적재율 80% 주의)은 **서버 설정**이다. 여기에는 판정 로직을 두지 않는다. 표시에만 쓰는 참고값이 필요하면 "표시용"이라고 이름에 드러낸다.
- 로봇 모델은 기본값 → 서버 `/robots/{id}/model` 순으로 덮어쓴다. 구조가 크게 다른 로봇(굴착기형 등)이면 설정만으로 해결하지 말고 `studio/actors/Robot`을 새로 만든다.
- `robotModel.ts`의 `DEFAULT_JOINT_RENDER`(관절별 그리기 축·방향)는 서버 모델에 없는 앱 쪽 가정이다.
- `robotCycle`의 `TANK_BASE_DEG`와 `DEMO_CYCLE`은 모의 서버(`mock-server/src/sim/robot.ts`)의 관절 값과 같아야 한다. 3D 홈의 섹터 칸은 이 각도에서 집으러 내려간 공구 끝에 맞춰 놓인다(`studio/world/layout.ts`의 `PICK`). 한쪽만 바꾸면 팔이 칸 밖을 집는다.
- 값마다 단위를 이름이나 주석에 적는다(`linkLengthsM`, `maxFps`).
- 이 폴더의 값은 상수 데이터와 작은 순수 함수만. React·store import 금지.
