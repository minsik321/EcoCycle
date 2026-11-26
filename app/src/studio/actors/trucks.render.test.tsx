import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@ecocycle/shared';
import { onSiteVehicles } from '../../config/processDisplay';
import { Director } from '../sim/director';
import { Trucks } from './Actors';

// 렌더와 연결된 차량 수 회귀 시험: 연출 감독의 값이 아니라, 프레임·React 갱신을 돌린 뒤
// 장면 그래프에서 실제로 보이는(visible) 트럭 모형 루트를 센다 (모형 칸이 모자라 빠지는 차를 잡는다).

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const STAGES = ['arrived', 'identified', 'unloading', 'unloaded', 'weighing_out', 'loading'] as const;

function vehicles(n: number): Vehicle[] {
  return Array.from({ length: n }, (_, i) => {
    const stage = STAGES[i % STAGES.length]!;
    const outbound = stage === 'loading';
    return {
      id: `v${i}`,
      kind: outbound ? 'outbound' : 'inbound',
      baleIds: [],
      stage,
      plate: stage === 'arrived' ? null : `1${i}가 0000`,
      companyName: stage === 'arrived' ? null : '회사',
      sectorId: stage === 'arrived' || outbound ? null : i % 2 ? 'sector-a' : 'sector-c',
      stageTimes: { arrived: iso(T0 - 120_000), [stage]: iso(T0 - 60_000) },
      updatedAt: iso(T0 - 60_000),
    };
  });
}

/** 장면에서 보이는 트럭 모형 루트 수 (덤프·윙바디 둘 중 보이는 쪽만, 루트와 조상이 모두 보여야 한다) */
function visibleTrucks(scene: Object3D): number {
  let n = 0;
  scene.traverse((o) => {
    if (typeof o.userData.truckIndex !== 'number') return;
    for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    n += 1;
  });
  return n;
}

describe('트럭 모형 렌더 (보이는 모형 수 = 표의 차량 N)', () => {
  it('12대(처음 칸 8개를 넘음) → 모두 보이고, 5대 출차 → 도로로 나간 뒤 7, 빈 목록 → 0', async () => {
    const d = new Director();
    // 장면을 먼저 올린다(처음 칸 8개) → 그 뒤 12대가 들어온다: 모형 칸이 그만큼 늘어나야 한다
    const renderer = await ReactThreeTestRenderer.create(<Trucks director={d} onSelect={() => {}} />);
    const list = vehicles(12);
    d.sync({ devices: {}, vehicles: list, batches: [], bales: [] }, T0);
    const scene = renderer.scene.instance as Object3D;
    expect(visibleTrucks(scene)).toBe(0);
    const frames = async () => {
      // 모형 칸이 늘어나는 것은 React 상태라 프레임 → 다시 그리기 → 프레임을 돌린다
      for (let i = 0; i < 3; i += 1) {
        d.step(1 / 20);
        await renderer.advanceFrames(2, 1 / 30);
        await renderer.update(<Trucks director={d} onSelect={() => {}} />);
      }
    };
    await frames();
    expect(onSiteVehicles(list)).toHaveLength(12);
    expect(visibleTrucks(scene)).toBe(12);

    const departed = list.map((v, i) => (i < 5 ? { ...v, stage: 'departed' as const } : v));
    d.sync({ devices: {}, vehicles: departed, batches: [], bales: [] }, T0 + 120_000);
    await frames();
    expect(onSiteVehicles(departed)).toHaveLength(7);
    // 출차한 차는 바로 사라지지 않고 도로로 달려 나간 뒤 빠진다 (S2i #7): 나가는 차만큼 더 보이다가 모두 나가면 7
    expect(visibleTrucks(scene)).toBe(7 + d.leavingCount());
    const drain = async () => {
      for (let i = 0; i < 20 * 300 && d.leavingCount() > 0; i += 1) d.step(1 / 20);
      await frames();
    };
    await drain();
    expect(d.leavingCount()).toBe(0);
    expect(visibleTrucks(scene)).toBe(7);

    d.sync({ devices: {}, vehicles: [], batches: [], bales: [] }, T0 + 121_000);
    await drain();
    expect(visibleTrucks(scene)).toBe(0);
    await renderer.unmount();
  });
});
