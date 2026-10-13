import type { Topic } from '@ecocycle/shared';

/** 로그인 동안 항상 구독하는 주제 */
export const BASE_TOPICS: readonly Topic[] = ['plant', 'devices', 'alarms'];
/** 로봇 관절 값: 홈과 로봇 확대 화면에 있을 때만 구독한다 (양이 많다) */
export const ROBOT_JOINTS_TOPIC: Topic = 'robot-1.joints';

export interface TopicDiff {
  subscribe: Topic[];
  unsubscribe: Topic[];
}

/** 원하는 주제와 이미 서버에 보낸 주제의 차이만 계산한다. */
export function diffTopics(desired: ReadonlySet<Topic>, sent: ReadonlySet<Topic>): TopicDiff {
  return {
    subscribe: [...desired].filter((t) => !sent.has(t)),
    unsubscribe: [...sent].filter((t) => !desired.has(t)),
  };
}

export interface Subscriptions {
  setDesired(topics: Iterable<Topic>): void;
  /** 서버에 아직 보내지 않은 구독·해제 */
  pending(): TopicDiff;
  /** pending()을 서버에 보냈다고 기록한다 */
  markSent(): void;
  /** 연결이 끊겼다. 다음 연결에서 원하는 주제를 모두 다시 보내야 한다. */
  reset(): void;
}

export function createSubscriptions(): Subscriptions {
  let desired = new Set<Topic>();
  let sent = new Set<Topic>();
  return {
    setDesired(topics) {
      desired = new Set(topics);
    },
    pending: () => diffTopics(desired, sent),
    markSent() {
      sent = new Set(desired);
    },
    reset() {
      sent = new Set();
    },
  };
}
