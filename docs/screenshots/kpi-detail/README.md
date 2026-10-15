# KPI 상세 · 7단위

실제 모의 서버 + Chromium, 한국 시각. 모든 수치·목표 범위는 예시 데이터입니다.

| KPI | 대시보드 390×844 | 대시보드 820×1180 | 3D 390×844 | 3D 820×1180 |
| --- | --- | --- | --- | --- |
| 오늘 생산 베일 | [폰](390x844-dashboard-balesToday.png) | [태블릿](820x1180-dashboard-balesToday.png) | [폰](390x844-3d-balesToday.png) | [태블릿](820x1180-3d-balesToday.png) |
| 평균 수분 | [폰](390x844-dashboard-averageMoisturePercent.png) | [태블릿](820x1180-dashboard-averageMoisturePercent.png) | [폰](390x844-3d-averageMoisturePercent.png) | [태블릿](820x1180-3d-averageMoisturePercent.png) |
| 압축기 가동률 | [폰](390x844-dashboard-compressorUptimePercent.png) | [태블릿](820x1180-dashboard-compressorUptimePercent.png) | [폰](390x844-3d-compressorUptimePercent.png) | [태블릿](820x1180-3d-compressorUptimePercent.png) |

재현: 저장소 루트에서 `node app/scripts/kpiDetails.mjs`.

API 세 지표×세 기간, 30일 데이터, 통계·당일 생산량 합계, 인증 401·입력 422, 시간대를 검증합니다. 화면은 360×780·390×844·820×1180, 글자 100/130%, 두 홈 진입, 기간 전환, Escape·초점 복귀, 오류 후 재시도, 연결 끊김을 확인합니다. 상세 화면 중에는 3D 그리기를 멈춥니다.

오늘 생산 베일의 ‘현재’는 당일 누적 생산량, 평균·최소/최대는 선택 기간의 시간별 또는 일별 생산량입니다. 가동률 막대의 파랑은 가동, 회색은 정지이며 툴팁에 구간별 분을 표시합니다. 수분 목표 10~14%는 서버 협의 전 목업 가정입니다.
