# 3D 홈: 실제 부지 배치 (S2d, 2026-11-24) → 현장 사진 기준 다듬기 (S2e, 2026-11-25)

위성사진(위가 북쪽)과 현장 사진 6장을 `app/src/studio/world/layout.ts`의 `sitePx` 하나(1px = 0.072)로 옮긴 3D 홈. 사진 파일 자체는 저장소에 넣지 않는다.
찍은 방법: Chromium(SwiftShader), 배율 1, `node app/scripts/yardStatic.mjs`. 시연 화면은 `/scene-demo?tier=standard`(예시 데이터, 입고·상차 차량 모두 서버 모양),
실제 홈은 모의 서버 + `admin` 로그인 + 3D 홈(화질은 접속 측정값). 사진 방향 화면은 `world/views.ts`의 `PHOTO_VIEWS`(지역 전환 목록에는 없다).

## S2e 화면 (지금 장면)

| 파일 | 화면 | 크기 | 보는 곳 |
| --- | --- | --- | --- |
| `demo-top-*.png`, `live-top-*.png` | 시연·실제 홈 | 390×844·820×1180·1440×900 | **위에서 보기**: 사진처럼 북쪽이 위 (`overall.png`·`site-marked.png`와 견준다) |
| `demo-wide-*.png`, `live-wide-*.png` | 〃 | 〃 | 부지 전체 (둘레 숲 언덕·먼 산 능선, 도로, 옹벽) |
| `demo-default-*.png`, `live-default-*.png` | 〃 | 〃 | 기본 구역 "섹터·로봇": 레일 축에 대칭인 큰 더미 A·C, 흩어진 파지 조각, 줄눈 바닥 |
| `demo-photo-gate-*.png`, `live-photo-gate-*.png` | 〃 | 〃 | **입구에서 서쪽** (`from-gate-inside.png`): 남동 베일 벽, 줄눈 마당, 멀리 숲 아래 북서 베일, 오른쪽 사무실 차양 |
| `demo-photo-weighbridge-*.png`, `live-photo-weighbridge-*.png` | 〃 | 〃 | **계근대 쪽** (`weighbridge.png`): 옹벽·쇠 난간 위 단, 노란 테두리 계근대, 짙은 회색 골판 사무실, 흰 창고, 쇠 기둥·콘 |
| `demo-photo-upperRoad-*.png`, `live-photo-upperRoad-*.png` | 〃 | 〃 | **남동 도로에서** (`from-upper-road.png`): 회색 철판 울타리 + 높은 녹색 그물망, 그 뒤 베일, 멀리 사무실 |
| `demo-photo-entrance-1440x900.png`, `live-photo-entrance-1440x900.png` | 〃 | 1440×900 | **입구 남쪽 도로에서 서북서** (`entrance.png`): 도로에서 마당으로 오르는 경사로, 오른쪽 계근대 단 옹벽, 베일, 파란 지붕 공장 |
| `demo-photo-approach-1440x900.png`, `live-photo-approach-1440x900.png` | 〃 | 1440×900 | **북동 도로에서 남쪽** (`approach.png`): 낮은 도로, 옹벽 위 2층 사무실과 동쪽 실외기, 전봇대·전선 |
| `demo-inbound-1440x900.png`, `live-inbound-1440x900.png` | 〃 | 1440×900 | 입구·계근대 (경사로, 번호판 인식 카메라 기둥) |
| `demo-baler-1440x900.png`, `live-baler-1440x900.png` | 〃 | 1440×900 | 압축기·레일 (가로형 압축기, 배출 받침대, 베일 저울) |
| `demo-bales-1440x900.png`, `live-bales-1440x900.png` | 〃 | 1440×900 | 베일 적치 (남동 칸 줄·북동 날개 벽, 북서 재고, 상차 자리의 윙바디, 지게차) |
| `yard/` | `node app/scripts/yardSoak.mjs` 결과 | 1440×900, 390×844 | 오래 돌린 뒤 베일 적치 구역 |

## S2e 시안 (본 구현 전)

| 파일 | 내용 |
| --- | --- |
| `sketch-coordinates.png` | 시안의 좌표 그림: 사진 px 좌표(`site-marked` 613×616, 위 = 북) 위에 `overall.png`를 맞춰 깔고 그린 배치(옹벽·경사로·계근대·번호판 카메라, 사무실, 압축기 건물·받침대·저울, 대칭 섹터, 베일 블록, 그물망·울타리, 전봇대, 줄눈·파지 조각 구역, 사진에서 잰 트럭 둘, 동선). 시안 그림이라 대기 자리·상차 자리·지게차 길의 최종 좌표는 `layout.ts`가 맞다(대기 자리는 마당 하나 + 도로 줄, 상차 자리 (366, 345)px 남쪽을 봄) |
| `before-top-1440x900.png` | 고치기 전 `/scene-demo` 위에서 보기 (기준 브랜치, high) |
| `draft-top-1440x900.png` | 시안 상태의 위에서 보기: 배율·베일·더미만 임시로 바꾼 화면 (본 구현 전) |

## 사진과 맞춘 배치

북서 숲, 북서 베일 구역(ㄱ자, 적치 재고: 상차는 여기서 하나씩), 사무실("태화리싸이클링" 자리, 위성사진의 세워 둔 화물차는 서버 값이 아니라 그리지 않는다), 사무실 바로 아래 계근대(가로로 긺, 동쪽 끝은 옹벽),
계근대와 남동 베일 구역 사이의 입구 경사로, 동쪽 도로(북 → 남서, 남쪽으로 오르막), 가운데 콘크리트 마당, 로봇(지금 포크레인 자리)과 그 양쪽 큰 더미(레일을 볼 때 오른쪽 A = 북서 갈색, 왼쪽 C = 남동 흰 더미, 레일 축에 대칭),
로봇에서 남서쪽 파란 지붕 압축기 건물로 오르는 경사 레일, 건물 남동 모서리의 배출구와 받침대·저울, 남동 베일 구역(ㄴ자, 새 베일을 쌓는 곳).

`docs/screenshots/studio/yard/`(이 폴더 밖)는 S2d 이전의 옛 배치(본관·출하 마당)를 찍은 것이다. 새 배치의 장시간 점검 그림은 이 폴더의 `yard/`다.
