# 작업 계획 (오케스트레이션)

메인 AI가 `/wf-graph`·`wf-delegate`로 작업을 나눌 때 읽는 문서다. 단계의 목표·완료 기준은 명세 5절 "개발 단계"가 기준이고, 이 문서는 그것을 작업 단위와 소유 경로로 나눈다.
단계를 시작하거나 끝낼 때 메인 AI가 "상태" 열을 고친다. 작성: 2026-11-24.

## 영역과 소유 경로

| 영역 | 소유 경로 | 비고 |
| --- | --- | --- |
| 기준 문서 | `docs/**`, 루트 `CLAUDE.md` | 사용자·메인 AI만. 작업자는 PR 본문에 수정 필요 사항을 적는다 |
| 계약 | `shared/**` | API 형식 변경은 명세 → shared → mock-server → app 순서. 계약 변경 단위는 단독으로 먼저 병합 |
| 모의 서버 | `mock-server/**` | 계약을 바꾸지 않는 시나리오·가짜 값 |
| 데이터층 | `app/src/api/**`, `app/src/realtime/**`, `app/src/store/**`, `app/src/integration/**` | 연결 끊김·인증·명령 흐름. 바꾸면 `test:integration` |
| 설정 | `app/src/config/**` | 가정에 의존하는 값. 여러 영역이 읽으므로 고치는 단위는 PR에 영향 범위를 적는다 |
| 2D 화면 | `app/src/features/**`, `app/src/components/**`, `app/src/routes.tsx`, `app/src/App.tsx`, `app/src/styles/**`, `app/src/test/**` | 권한 표 점검(`permissionMatrix.ts`)은 명세 6절과 함께 바꾼다 |
| 3D 홈 | `app/src/studio/**` | `app/src/studio/CLAUDE.md` 고정 규칙 |
| 점검 스크립트 | `app/scripts/**` | 스크립트가 점검하는 화면의 영역 단위가 함께 고친다. 추가·변경 시 CLAUDE.md 명령어 표 수정 필요를 PR에 적는다 |
| 빌드·배포 | 루트 `package.json`, `package-lock.json`, `vercel.json`, `app/package.json`, `app/vite.config.ts`, `app/capacitor.config.*`, `app/android/**` | 의존성 추가는 이 영역 또는 PR에 이유 |

## 단계 그래프

| 단계 ID | 목표 | 영역 | 선행 | 기준 문서 | 상태 |
| --- | --- | --- | --- | --- | --- |
| S2a | 3D 월드 재작업 마무리 ("살아있는 3D 월드" 범위) | 3D 홈, 설정 | - | 명세 3절 "3D 홈과 대시보드 홈", `app/src/studio/CLAUDE.md`, decisions 2026-10-13 "홈 3D 재설계" | 진행 중 |
| S2c | 섹터 2곳(`sector-a`·`sector-c`) 계약 변경: 명세(메인 AI) → `shared` → 모의 서버 → 2D 화면·설정·테스트·점검 스크립트. 3D는 컴파일만 맞춤 | 계약, 모의 서버, 데이터층, 설정(`config/yard.ts` 제외), 2D 화면, 점검 스크립트, 3D 홈(컴파일 맞춤만) | - | decisions 2026-11-24 "실제 부지 배치와 섹터 2곳", 명세 1·3·6절 | 완료 (2026-11-24, S2d와 함께 main에 한 번 병합) |
| S2d | 3D 홈을 실제 부지 배치로 재구성(사무실·계근대·입구·도로·숲·압축기 건물·경사 레일·적치 구역 2곳·상차 차량 예시) | 3D 홈, `config/yard.ts` | S2c | 같은 결정, `app/src/studio/CLAUDE.md`, 명세 3절 "3D 홈과 대시보드 홈" | 완료 (2026-11-24) |
| S2f | 출차 계근 단계·상차 차량(`kind`)·회사 안 차량 수: 명세(메인 AI) → `shared` → 모의 서버 → 2D 화면·설정·테스트 | 계약, 모의 서버, 데이터층, 설정(`config/yard.ts` 제외), 2D 화면, 점검 스크립트(3D 제외) | - | decisions 2026-11-25 "출차 계근·상차 차량…", 명세 6절 "공정 흐름"·"공정 기록" | 완료 (2026-11-26, PR #16) |
| S2e | 3D 홈을 현장 사진 기준으로 다듬기(지형·옹벽·입구, 계근 동선, 압축기·받침대·베일 저울, 베일 흐름·정돈, 섹터 대칭, 상차 윙바디, 장면 채우기) | 3D 홈, `config/yard.ts`, 3D 점검 스크립트 | S2f(차량 흐름만) | 같은 결정, `app/src/studio/CLAUDE.md` | 완료 (2026-11-26, PR #17) |
| S2g | 데스크톱(1440×900) 위에서 보기에서 부지 북·남 끝이 지표 카드·공정 패널 밑으로 들어가는 것 고치기(`three/framing.ts`, 폰·태블릿 top과 wide는 그대로) | 3D 홈 | S2e | decisions 2026-11-26 "S2e 마무리" | 대기 |
| A1 | Capacitor 안드로이드 빌드 (`build:android`: app 빌드 → `cap sync android`) | 빌드·배포 | - | 명세 4절 "기술 구성", decisions "배포 방식", `docs/deployment.md` | 대기 |
| S2b | 실제 태블릿 측정: 30fps 안정, 30분 이상 끊김·발열 없음 | 3D 홈 (실기기, 사용자 참여) | S2a | 명세 5절 2단계 완료 기준 | 대기 |
| S3a | 실서버 계약 맞춤: 명세 → `shared` → mock-server | 계약, 모의 서버 | 서버 담당 답변 (`questions.md` B) | 명세 6절, `docs/questions.md` | 보류 |
| S3b | 실서버 연동: api·realtime·env, 관절 값 매핑(축 수·영점·단위) | 데이터층, 설정 | S3a | 명세 5절 3단계 | 대기 |
| S4 | 장시간·현장 테스트: 하루 이상 구동, 메모리·재연결, 앱 배포 | 데이터층, 빌드·배포 | S2b, S3b, A1 | 명세 5절 4단계 | 대기 |
| S5 | 확장: 압축기 이후 공정 | 3D 홈, 2D 화면 | S2b (여유 확인 시만) | 명세 5절 5단계 | 조건부 |

S2a와 A1은 소유 경로가 겹치지 않아 함께 돌릴 수 있다. 동시에 도는 단계는 최대 3개.

## 공통 검수 기준

- 검사 명령(`.claude/workflow.json` verify): `npm run typecheck && npm run test && npm run build`. 데이터층·계약·모의 서버를 건드리면 `npm run test:integration`(단독 실행).
- 화면을 바꾸면 CLAUDE.md 명령어 표에서 그 화면의 점검 스크립트를 돌리고 스크린샷을 PR에 붙인다(Chromium, 하나씩).
- 리뷰 기준: CLAUDE.md 전체 공통 규칙 1~9, 작업 폴더의 CLAUDE.md, 명세와의 일치, 권한 표 일치, 소유 경로 경계, docs/ 미수정.
- 단계별 세부 기준은 각 단계의 루프 엔지니어(`wf-loop`)가 만든다.

## 사용자 확인 시점

- S2a 완료: 3D 월드 화면을 세 크기(390·820·1440) 스크린샷으로 확인
- S2b: 실제 태블릿 측정은 사용자가 기기에서 직접 (메인 AI는 측정 방법과 기록만)
- S3a 시작 전: 서버 담당 답변 확인, 명세 수정안 승인
- A1 완료: APK 설치·실행 확인
