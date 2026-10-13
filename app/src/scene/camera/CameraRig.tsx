import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { CAMERA } from '../../config/sceneLayout';
import { baseZoom, cameraOffset } from '../layout';
import type { CameraPreset } from '../layout';

const OFFSET = cameraOffset();

/**
 * 고정된 아이소메트릭 카메라. 시점 회전과 핀치 확대는 없다(OrbitControls를 쓰지 않는다).
 * 기기를 고르면 정해진 위치(preset)로 부드럽게 이동하며 확대하고, 다 도착하면 그리기를 멈춘다.
 */
export function CameraRig({ preset, busyRef }: { preset: CameraPreset; busyRef: MutableRefObject<boolean> }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  // 지금 값(cur)과 가야 할 값(goal). 매 프레임 새 객체를 만들지 않도록 숫자로 들고 있는다.
  const cur = useRef({ x: 0, y: 0, z: 0, zoom: 1, ready: false });
  const goal = useRef({ x: 0, y: 0, z: 0, zoom: 1 });

  const apply = () => {
    const c = cur.current;
    camera.position.set(c.x + OFFSET[0], c.y + OFFSET[1], c.z + OFFSET[2]);
    camera.lookAt(c.x, c.y, c.z);
    camera.zoom = c.zoom;
    camera.updateProjectionMatrix();
  };

  useEffect(() => {
    const g = goal.current;
    [g.x, g.y, g.z] = preset.center;
    g.zoom = baseZoom(size.width, size.height) * preset.zoom;
    const c = cur.current;
    if (!c.ready) {
      // 처음에는 이동 없이 바로 그 자리에서 시작한다
      Object.assign(c, g, { ready: true });
      apply();
    } else {
      busyRef.current = true;
    }
    invalidate();
    // apply는 camera만 쓰므로 의존 목록에 넣지 않는다
  }, [preset, size.width, size.height, camera, invalidate, busyRef]);

  useFrame((_state, delta) => {
    if (!busyRef.current) return;
    const c = cur.current;
    const g = goal.current;
    const k = 1 - Math.exp(-CAMERA.damping * Math.min(delta, 0.1));
    c.x += (g.x - c.x) * k;
    c.y += (g.y - c.y) * k;
    c.z += (g.z - c.z) * k;
    c.zoom += (g.zoom - c.zoom) * k;
    const close = Math.abs(g.x - c.x) + Math.abs(g.y - c.y) + Math.abs(g.z - c.z) < 0.005 && Math.abs(g.zoom - c.zoom) < g.zoom * 0.002;
    if (close) {
      Object.assign(c, g);
      busyRef.current = false;
    }
    apply();
  });

  return null;
}
