import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { Vector3 } from 'three';
import type { DeviceId } from '@ecocycle/shared';
import { DEVICE_ORDER } from '../../config/sceneLayout';
import { deviceAnchor } from '../layout';

export type PinElements = Partial<Record<DeviceId, HTMLElement | null>>;

const point = new Vector3();

/**
 * 기기 핀의 화면 위치를 계산해 HTML 핀(장면 밖, features/home이 그린다)에 써 넣는다.
 * 장면 안에는 글자를 두지 않고, 수치·라벨은 HTML로 그린다. React 상태를 거치지 않고 스타일만 바꾼다.
 */
export function PinProjector({ pins }: { pins: MutableRefObject<PinElements> }) {
  const anchors = useMemo(() => DEVICE_ORDER.map((id) => ({ id, pin: deviceAnchor(id).pin })), []);

  useFrame(({ camera, size }) => {
    for (const { id, pin } of anchors) {
      const element = pins.current[id];
      if (!element) continue;
      point.set(pin[0], pin[1], pin[2]).project(camera);
      const x = (point.x * 0.5 + 0.5) * size.width;
      const y = (-point.y * 0.5 + 0.5) * size.height;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      element.style.visibility = 'visible';
    }
  });
  return null;
}
