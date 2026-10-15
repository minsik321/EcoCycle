import { useEffect, useState } from 'react';
import type { RobotModel } from '@ecocycle/shared';
import { DEFAULT_JOINT_RENDER } from '../../config/robotModel';
import type { JointSample } from '../../realtime';
import { getJointBuffer } from '../../store/realtimeClient';

/** 그림을 다시 그리는 간격(ms). 관절 값은 초당 10~20번 들어오지만 작은 옆모습이라 초당 15번이면 충분하다 */
const DRAW_MS = 1000 / 15;

// 그림 좌표(viewBox 240×160: 폰의 넓은 칸과 태블릿의 세로로 긴 칸 모두에서 너무 작아지지 않는 비율). 밑동은 왼쪽, 컨베이어는 오른쪽 아래.
const BASE_X = 84;
const FLOOR_Y = 146;
/** 팔을 다 폈을 때 길이(그림 단위). 링크 길이 비율은 로봇 모델을 따른다 */
const REACH = 118;
const DIAL = { x: 214, y: 26, r: 18 };

const rad = (deg: number) => (deg * Math.PI) / 180;

interface Point {
  x: number;
  y: number;
}

/**
 * 관절 값으로 옆모습 마디 위치를 구한다. 3D 장면과 같은 규칙(config/robotModel의 DEFAULT_JOINT_RENDER)을 쓴다:
 * 모든 관절이 영점이면 팔은 똑바로 서 있고, 앞뒤로 기울이는 관절(z축)만 옆모습에 보인다. 좌우 회전(밑동)은 위에서 본 다이얼로 따로 보인다.
 * 값을 바꾸지 않고 그림으로 옮기기만 한다.
 */
function sideView(model: RobotModel, joints: readonly number[]): Point[] {
  const lengths = model.linkLengthsM;
  const total = lengths.reduce((sum, l) => sum + l, 0) || 1;
  let angle = 0;
  let p: Point = { x: BASE_X, y: FLOOR_Y };
  const points: Point[] = [p];
  model.joints.forEach((joint, i) => {
    const render = DEFAULT_JOINT_RENDER[i];
    const value = joints[i] ?? joint.zeroDeg;
    if (render?.axis === 'z') angle += render.sign * rad(value - joint.zeroDeg);
    const length = ((lengths[i] ?? 0) / total) * REACH;
    if (length <= 0) return;
    // three.js처럼 z축으로 angle만큼 돌린 "위쪽" 방향. 그림은 y가 아래로 커지므로 뒤집는다
    p = { x: p.x - Math.sin(angle) * length, y: p.y - Math.cos(angle) * length };
    points.push(p);
  });
  return points;
}

export interface ArmSilhouetteProps {
  model: RobotModel;
  /** 끊기면 그리기를 멈추고 마지막 자세에 머문다 */
  frozen: boolean;
}

/**
 * 로봇팔 기기 페이지 맨 위의 작은 실시간 옆모습. 관절 값 버퍼(jointBuffer)를 초당 15번 읽어 그린다.
 * 연결이 끊기면 읽기를 멈춰 마지막 자세 그대로 둔다(감싸는 DeviceHero가 흐리게 한다). 관절 값을 받기 전에는 영점 자세를 흐리게.
 */
export function ArmSilhouette({ model, frozen }: ArmSilhouetteProps) {
  const [sample, setSample] = useState<JointSample | null>(() => getJointBuffer()?.sample(Date.now()) ?? null);

  useEffect(() => {
    if (frozen) return;
    const read = () => setSample(getJointBuffer()?.sample(Date.now()) ?? null);
    read();
    const timer = setInterval(read, DRAW_MS);
    return () => clearInterval(timer);
  }, [frozen]);

  const joints = sample?.joints ?? model.joints.map((j) => j.zeroDeg);
  const points = sideView(model, joints);
  const tip = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? tip;
  const tipAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const baseJoint = model.joints[0];
  const baseDeg = baseJoint ? (joints[0] ?? baseJoint.zeroDeg) - baseJoint.zeroDeg : 0;
  const holding = sample?.gripper.holding ?? false;
  const closed = sample?.gripper.closed ?? false;
  const spread = closed ? 3 : 7;
  // 손가락은 끝 마디 방향에 수직으로 벌린다
  const nx = -Math.sin(tipAngle);
  const ny = Math.cos(tipAngle);
  const fx = Math.cos(tipAngle) * 9;
  const fy = Math.sin(tipAngle) * 9;
  const label = sample
    ? `로봇팔 옆모습, 밑동 ${Math.round(baseDeg)}도, 그리퍼 ${holding ? '잡고 있음' : closed ? '닫힘' : '열림'}`
    : '로봇팔 옆모습, 관절 값을 기다리는 중';

  return (
    <svg role="img" aria-label={label} viewBox="0 0 240 160" preserveAspectRatio="xMidYMid meet" className={`h-full w-full ${sample ? '' : 'opacity-50'}`}>
      {/* 바닥과 컨베이어(오른쪽) */}
      <line x1="6" y1={FLOOR_Y} x2="234" y2={FLOOR_Y} className="stroke-line" strokeWidth="2" />
      <rect x="150" y={FLOOR_Y - 22} width="84" height="10" rx="5" className="fill-paper-deep stroke-line" strokeWidth="1.5" />
      <text x="192" y={FLOOR_Y - 4} textAnchor="middle" className="fill-ink-faint text-[9px]">
        컨베이어
      </text>
      {/* 밑동 받침 */}
      <rect x={BASE_X - 18} y={FLOOR_Y - 8} width="36" height="8" rx="2" className="fill-ink-soft" />
      {/* 팔 마디 */}
      <polyline
        points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        className="stroke-accent"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.slice(1, -1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="5.5" className="fill-surface stroke-accent-strong" strokeWidth="2" />
      ))}
      {/* 그리퍼: 손가락 둘, 잡고 있으면 파지 덩어리 */}
      {[1, -1].map((side) => (
        <line
          key={side}
          x1={tip.x + nx * spread * side}
          y1={tip.y + ny * spread * side}
          x2={tip.x + nx * spread * side + fx}
          y2={tip.y + ny * spread * side + fy}
          className="stroke-ink"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {holding && <rect x={tip.x + fx * 0.6 - 5} y={tip.y + fy * 0.6 - 5} width="10" height="10" rx="2" className="fill-kraft" />}
      {/* 위에서 본 밑동 방향 */}
      <circle cx={DIAL.x} cy={DIAL.y} r={DIAL.r} className="fill-surface stroke-line" strokeWidth="1.5" />
      <line
        x1={DIAL.x}
        y1={DIAL.y}
        x2={DIAL.x + Math.sin(rad(baseDeg)) * (DIAL.r - 4)}
        y2={DIAL.y - Math.cos(rad(baseDeg)) * (DIAL.r - 4)}
        className="stroke-accent-strong"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={DIAL.x} cy={DIAL.y} r="2.5" className="fill-accent-strong" />
      <text x={DIAL.x} y={DIAL.y + DIAL.r + 11} textAnchor="middle" className="fill-ink-faint text-[9px]">
        밑동 {Math.round(baseDeg)}°
      </text>
    </svg>
  );
}
