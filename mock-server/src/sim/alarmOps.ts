import type { Alarm, AlarmLevel, DeviceId } from '@ecocycle/shared';
import { publish } from './bus';
import { alarms } from './state';

let alarmSeq = 3300;

/** 알람을 새로 열고 `alarm` 메시지를 보낸다. */
export function raiseAlarm(deviceId: DeviceId, level: AlarmLevel, message: string): Alarm {
  alarmSeq += 1;
  const alarm: Alarm = {
    id: `al-${alarmSeq}`,
    level,
    deviceId,
    message,
    state: 'active',
    ts: new Date().toISOString(),
  };
  alarms.push(alarm);
  publish({ type: 'alarm', alarm: { ...alarm } });
  return alarm;
}

/** 알람 내용(단계·메시지)이 바뀌었을 때 다시 알린다. */
export function updateAlarm(alarm: Alarm, level: AlarmLevel, message: string): void {
  alarm.level = level;
  alarm.message = message;
  alarm.ts = new Date().toISOString();
  publish({ type: 'alarm', alarm: { ...alarm } });
}

/** 알람을 해제하고 `alarm` 메시지를 보낸다. */
export function clearAlarm(alarm: Alarm): void {
  alarm.state = 'cleared';
  alarm.ts = new Date().toISOString();
  publish({ type: 'alarm', alarm: { ...alarm } });
}
