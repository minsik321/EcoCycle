import { useEffect, useMemo, useState } from 'react';
import { Group } from 'three';
import { MODELS, loadModel, repaint } from '../models';
import type { ModelKey } from '../models';
import { disposeTree } from '../three/kit';
import { PARKED, buildParkedCars } from './buildWorld';

const CAR_KEYS = Object.keys(MODELS) as ModelKey[];

/**
 * 주차된 차. 먼저 코드로 만든 모형을 보여 주고, 모델 파일(GLB)을 다 받으면 그것으로 바꾼다.
 * 파일을 못 받으면(오프라인, 파일 없음) 코드 모형을 그대로 둔다.
 */
export function ParkedCars() {
  const fallback = useMemo(buildParkedCars, []);
  const [models, setModels] = useState<Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    let built: Group | null = null;
    Promise.all(CAR_KEYS.map(loadModel))
      .then((loaded) => {
        if (cancelled) return;
        built = new Group();
        PARKED.forEach((slot, i) => {
          const car = repaint(loaded[i % loaded.length]!, slot.paint);
          car.position.set(slot.x, 0.03, slot.z);
          car.rotation.y = slot.rotY;
          built!.add(car);
        });
        setModels(built);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (built) disposeTree(built);
    };
  }, []);

  useEffect(() => () => disposeTree(fallback), [fallback]);

  return <primitive object={models ?? fallback} />;
}
