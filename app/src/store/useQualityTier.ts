import { useEffect } from 'react';
import { tierFromProbe } from '../config/quality';
import { useAppDispatch, useAppSelector } from './hooks';
import { measureFps } from './qualityProbe';
import { qualityProbed } from './slices/ui';

/**
 * 앱 최상단에서 한 번만 쓴다.
 * - 화질 단계를 html의 data-quality에 적어 유리 패널(styles/index.css)이 단계에 맞게 바뀌게 한다.
 * - 이 기기에서 고른 적이 없으면(자동) 짧게 프레임을 재서 단계를 고른다. 잴 수 없으면 기본 단계로 둔다.
 */
export function useQualityTier(): void {
  const dispatch = useAppDispatch();
  const tier = useAppSelector((state) => state.ui.qualityMode);
  const auto = useAppSelector((state) => state.ui.qualityAuto);

  useEffect(() => {
    document.documentElement.dataset.quality = tier;
  }, [tier]);

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    void measureFps().then((fps) => {
      if (cancelled || fps === null) return;
      dispatch(qualityProbed(tierFromProbe(fps, navigator.hardwareConcurrency)));
    });
    return () => {
      cancelled = true;
    };
  }, [auto, dispatch]);
}
