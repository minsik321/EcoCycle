# app/src/scene — 홈 3D 장면 (react-three-fiber)

밝은 저폴리 아이소메트릭 장면이다. **화려한 연출이 아니라 저사양 태블릿에서 끊김 없이 도는 것**이 목표다.
2단계(3D 홈 시안)에서 시작한다. 1단계는 2D 홈으로 먼저 완성한다.

## 장면 구성 (명세 1절)

벽 한쪽을 잘라낸 방 안에 탱크 4개(A1, A2, B1, B2), 중앙 로봇팔, 로봇 옆에서 압축기까지 이어지는 긴 컨베이어 하나(Section Z), 압축기.
위치·카메라 프리셋은 `config/sceneLayout.ts`에서 읽는다.

## 예정 구조

```
scene/
├── HomeScene.tsx       Canvas, 조명, frameloop 제어, 화질 모드 적용
├── camera/             고정 아이소메트릭 카메라, 기기별 프리셋으로 부드럽게 이동
├── objects/            Room, Tank(수위 → 파지 조각 수), Conveyor, Compressor, RobotArm
├── robot/              JointSource 인터페이스와 구현: fixed(정지), demo(정해진 동작), progress(단계+진행률), live(jointBuffer)
├── pins/               기기 핀과 탭 처리 → ui.selectedDevice
└── materials.ts        공용 불투명 재질 몇 개(재사용)
```

## 성능 원칙 (명세 4절, 반드시 지킬 것)

1. 불투명 저폴리, 작은 오브젝트 수, 바닥에 **미리 그린** 그림자 텍스처. 실시간 그림자·투명 재질·빛 번짐(bloom)·유리 효과 금지.
2. 움직임이 없으면 그리지 않는다: `frameloop="demand"` + 필요할 때 `invalidate()`. 화면이 숨겨지거나 CCTV가 열리면 그리기 루프 정지.
3. 초당 30프레임 이하로 제한. 센서 값이 빨라도 화면 반영은 묶어서.
4. 탱크 안 파지는 `InstancedMesh` 하나로, 수위(`fillPercent`)에 맞춰 보이는 개수만 조절. 상한은 `config/quality.ts`.
5. 재질·지오메트리는 공유하고 매 프레임 새 객체를 만들지 않는다(`useFrame` 안에서 `new` 금지).
6. 연출을 추가하기 전에 가장 낮은 사양의 실제 태블릿에서 30분 이상 구동해 프레임·발열을 확인한다.

## 카메라·조작

- 시점 회전 없음, 핀치 확대 없음(OrbitControls 쓰지 않음).
- 기기나 핀을 누르면 정해진 프리셋 위치로 카메라가 이동하며 확대, 우측 상세 카드는 `features/home`이 띄운다.

## 로봇팔

- `RobotArm`은 **입력과 분리**한다: `JointSource`에서 관절 각도·그리퍼를 받아 그리기만 한다. 입력을 바꿔도 그리기 코드는 그대로.
- 링크 길이·축 방향·영점·각도 범위는 `config/robotModel`(서버 `/robots/{id}/model`로 덮어씀)에서.
- 관절 값은 `useFrame`에서 `realtime/jointBuffer.sample()`로 읽는다. Redux 구독으로 받지 않는다.
- 연결 끊김(`connection.status === 'offline'`)이면 팔을 마지막 자세에서 멈추고 끊김 표시를 띄운다. 추측으로 움직이지 않는다.
- 후퇴 순서: live → progress → demo. demo는 실제와 어긋날 수 있으니 화면에 "시연 동작"임을 표시한다.

## 기타

- 장면 안 글자는 최소화하고, 수치·라벨은 HTML 오버레이(features/home)로 그린다.
- 3D 모델 파일을 쓰게 되면 glTF + 압축, 폴리곤 수를 `docs/decisions.md`에 기록한다.
- 5단계 확장(압축기 이후 공정)은 2단계 테스트에서 여유가 확인된 경우에만.
