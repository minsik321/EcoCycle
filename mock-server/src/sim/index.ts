import { ROBOT_TICK_MS, tickRobot } from './robot';
import { tickPlant } from './plant';
import { tickProcess } from './process';

/** 시뮬레이터를 시작한다. 값 변화는 sim/bus 로 나가고 stream.ts 가 연결된 클라이언트에 보낸다. */
export function startSim(): void {
  setInterval(tickPlant, 1000);
  setInterval(tickProcess, 1000);
  setInterval(tickRobot, ROBOT_TICK_MS);
}
