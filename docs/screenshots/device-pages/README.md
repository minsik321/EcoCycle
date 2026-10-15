# 기기 페이지 — 로봇팔·압축기·컨베이어 (2026-10-16 재설계)

재현: 루트에서 `node app/scripts/devicePages.mjs`. 모의 서버와 앱을 스스로 띄우고 로컬 Chromium으로 찍는다(내려받지 않음).
값은 모두 모의 서버의 예시 데이터다.

- `390x844-*`(폰), `820x1180-*`(세로 태블릿). 저장한 그림은 글자 100%이고, 글자 130%는 같은 흐름으로 짧은 글 꺾임·가로 넘침만 점검한다.
- `robot-1-top`(+`-full`): 맨 위 실시간 옆모습·주요 수치·지금/다음·운전 모드.
- `robot-mode-1-auto`, `robot-mode-2-pinned-confirm`, `robot-mode-2-pinned`, `robot-mode-3-manual`: 운전 모드 세 칸(자동 → 자동 · 섹터 지정 A1·B1 확인 → 적용됨 → 수동, 집을 섹터·집기 한 줄). 실제 명령으로 바꾼다.
- `robot-2-details`: "자세히"(진단 · 관절 값은 관리자만, 설정, 오류 로그).
- `compressor-1-top`(+`-full`), `compressor-2-details`: 베일러·원형 압력 게이지, 주요 수치, 지금 배치와 배치·베일 링크, 자세히(이력·설정·알람·점검 이력).
- `conveyor-1-top`(+`-full`), `conveyor-2-details`: 흐르는 벨트, 주요 수치, 자세히(이력·속도 설정·알람 이력).
- `validation.txt`: 마지막 실행 결과(두 크기·두 글자 크기, 모의 서버 값 점검: 집기 부피 0.06~0.14 m³ 여러 값, `itemsToBaler`, `cycleStage`).
- `s2-template-*`: 2단계에 만든 기기 페이지 틀 미리 보기(`/design/device`, 예시 값).
