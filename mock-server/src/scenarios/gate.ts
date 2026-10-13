// 시나리오가 WebSocket 전송을 제어하는 스위치. stream.ts 가 읽고 scenarios/index.ts 가 바꾼다.
export const streamGate = {
  /** true이면 연결은 유지한 채 모든 메시지(heartbeat 포함)를 보내지 않는다 */
  muted: false,
  /** 모든 메시지에 더하는 지연(ms)과 흔들림(ms). 순서는 유지된다. */
  latencyMs: 0,
  jitterMs: 0,
};
