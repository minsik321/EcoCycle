# 결정 기록

명세(`dashboard-spec.md`)에 없는 구조·기술 결정을 남긴다. 최신 항목이 아래로 간다.

## 2026-10-13 프로젝트 폴더 구조 초안
- 결정: npm workspaces로 `shared`(API 타입) · `mock-server` · `app`을 한 저장소에 둔다. 앱 코드는 `api` / `realtime` / `store` / `config` / `components` / `features` / `scene`으로 나눈다.
- 이유: 모의 서버와 앱이 같은 타입을 써야 명세와 어긋나는 곳이 컴파일 단계에서 드러난다. 3D 장면과 2D 화면, 고빈도 관절 값과 저빈도 상태를 분리해야 성능 원칙을 지키기 쉽다.
- 상태: 가정(사용자 검토 필요)

## 2026-10-13 언어·도구 선택
- 결정: TypeScript, Vite, Redux Toolkit(앱 상태), react-router, react-three-fiber + drei(최소 사용), 모의 서버는 Node(Express + ws).
- 이유: 명세는 React·Three.js·Capacitor만 정했다. TypeScript는 API 계약을 타입으로 고정하기 위해, Redux Toolkit은 기존에 익숙한 도구라서 선택했다. 관절 값은 Redux에 넣지 않는다(초당 10~20회 갱신이 리렌더를 일으킴).
- 상태: 가정(사용자 검토 필요)

## 2026-10-13 문서 위치 변경
- 결정: 기존 명세서 파일을 `docs/dashboard-spec.md`로 옮기고 이름을 바꿨다. 내용은 그대로다.
- 상태: 확정
