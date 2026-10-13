import { describe, expect, it } from 'vitest';
import type { Topic } from '@ecocycle/shared';
import { BASE_TOPICS, ROBOT_JOINTS_TOPIC, createSubscriptions, diffTopics } from './subscriptions';

describe('diffTopics', () => {
  it('원하는 주제와 보낸 주제의 차이만 돌려준다', () => {
    const desired = new Set<Topic>(['plant', 'alarms', 'robot-1.joints']);
    const sent = new Set<Topic>(['plant', 'devices']);
    expect(diffTopics(desired, sent)).toEqual({ subscribe: ['alarms', 'robot-1.joints'], unsubscribe: ['devices'] });
  });

  it('같으면 아무것도 보내지 않는다', () => {
    const same = new Set<Topic>(['plant']);
    expect(diffTopics(same, new Set(same))).toEqual({ subscribe: [], unsubscribe: [] });
  });
});

describe('subscriptions', () => {
  it('기본 주제는 plant, devices, alarms이고 관절 값은 따로다', () => {
    expect([...BASE_TOPICS]).toEqual(['plant', 'devices', 'alarms']);
    expect(ROBOT_JOINTS_TOPIC).toBe('robot-1.joints');
  });

  it('보낸 뒤에는 변화분만 남는다', () => {
    const s = createSubscriptions();
    s.setDesired(BASE_TOPICS);
    expect(s.pending().subscribe).toEqual(['plant', 'devices', 'alarms']);
    s.markSent();
    expect(s.pending()).toEqual({ subscribe: [], unsubscribe: [] });

    s.setDesired([...BASE_TOPICS, ROBOT_JOINTS_TOPIC]);
    expect(s.pending()).toEqual({ subscribe: ['robot-1.joints'], unsubscribe: [] });
    s.markSent();

    s.setDesired(BASE_TOPICS);
    expect(s.pending()).toEqual({ subscribe: [], unsubscribe: ['robot-1.joints'] });
  });

  it('연결이 끊기면 원하는 주제를 모두 다시 보내야 한다', () => {
    const s = createSubscriptions();
    s.setDesired(BASE_TOPICS);
    s.markSent();
    s.reset();
    expect(s.pending().subscribe).toEqual(['plant', 'devices', 'alarms']);
  });
});
