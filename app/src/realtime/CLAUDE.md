# app/src/realtime — WebSocket, 끊김 감지, 관절 값 버퍼

WebSocket 하나로 실시간 값을 받는다. 저빈도 값은 store로, 고빈도 관절 값은 store 밖의 버퍼로 보낸다.

## 파일

```
realtime/
├── types.ts          RealtimeSink(store가 연결할 출력 인터페이스), ConnectionState
├── socket.ts         createRealtimeClient: ws-ticket 발급 → 연결 → 구독 → 감시 → 재연결(1초부터 두 배씩, 최대 15초) → REST 재동기화(sink.resync)
├── subscriptions.ts  주제 구독 관리: 화면이 원하는 주제 집합을 받아 subscribe/unsubscribe 차이만 전송
├── dispatch.ts       메시지 type별 분기: plant.summary, device.state, alarm, command.result, heartbeat → store / robot.joints → jointBuffer
├── watchdog.ts       마지막 수신 시각 추적, 15초 무수신 → 연결 끊김
├── jointBuffer.ts    관절 값 링 버퍼 + 0.1~0.2초 지연 보간
├── index.ts          재수출
└── useRealtime.ts    앱 최상단에서 한 번 쓰는 훅 (store 연결 단계(D-17)에서 만든다)
```

## 규칙

- realtime은 store를 import하지 않는다. 값은 `RealtimeSink`로 내보내고 store 쪽(useRealtime)이 이것을 구현해 연결한다.
- 소켓이 닫히면 15초를 기다리지 않고 바로 offline으로 표시한다. 연결은 열려 있어도 15초 무수신이면 끊긴 것으로 보고 닫은 뒤 새 티켓으로 다시 연결한다.
- 소켓이 열린 것만으로는 online이 아니다. 새 연결의 **첫 메시지**를 받았을 때 online으로 바꾸고 REST로 맞춘다 (서버가 연결만 열어 두고 침묵해도 끊김 표시를 유지한다).
- jointBuffer는 새 연결의 첫 메시지에서 비운다 (서버가 다시 시작하면 seq가 처음으로 돌아간다). 끊겨 있는 동안에는 마지막 자세를 남겨 두어 로봇팔이 그 자세로 멈춰 있게 한다.
- 연결은 앱 전체에 **하나**. 화면마다 새로 열지 않는다.
- 토큰을 주소에 넣지 않는다. 매 연결(재연결 포함)마다 새 티켓을 받는다(30초 유효, 1회용).
- 구독: `plant`, `devices`, `alarms`는 로그인 동안 항상. `robot-1.joints`는 **홈 화면과 로봇 확대 화면에 있을 때만** 구독하고 나가면 해제한다.
- 연결 끊김:
  - 마지막 메시지 후 15초간 아무것도 없으면 store의 `connection.status = 'offline'`과 마지막 수신 시각을 기록한다. 화면과 로봇팔은 이 값을 보고 멈춘다.
  - 재연결되면 구독을 다시 보내고 REST로 요약·기기 상태·활성 알람을 한 번 다시 받아 맞춘다.
- `device.state`가 빠르게 와도 store 반영은 초당 몇 번으로 묶는다(같은 기기는 마지막 값만).
- `robot.joints`:
  - store(Redux)에 넣지 않는다. 초당 10~20회 상태 갱신은 리렌더를 일으킨다.
  - `seq`가 이전보다 작거나 같으면 버린다. `ts`로 지연을 확인한다.
  - `jointBuffer.sample(now)`가 지연 버퍼 기준으로 보간된 관절 각도·그리퍼를 돌려주고, `scene`의 `useFrame`에서 이것을 읽는다.
  - 관절 순서·단위·영점은 `/robots/{id}/model`(없으면 `config/robotModel`)을 따른다. 여기서 변환하지 않고 원래 값을 그대로 저장한다.
- 앱이 백그라운드로 가면(visibilitychange, Capacitor 앱 상태) 관절 구독을 해제하고, 돌아오면 다시 구독 + REST 재동기화.
- 단위 테스트: 보간, seq 역순 처리, 15초 감시 타이머, 구독 차이 계산은 가짜 타이머로 테스트한다.
