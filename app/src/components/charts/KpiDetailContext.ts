import { createContext } from 'react';
import type { PlantMetric } from '@ecocycle/shared';

/** 홈이 상세 화면을 제공한다. studio는 features를 import하지 않는다. */
export const KpiDetailContext = createContext<(metric: PlantMetric) => void>(() => {});
export const KpiDetailOpenContext = createContext(false);
