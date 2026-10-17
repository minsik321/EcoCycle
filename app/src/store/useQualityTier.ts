import { useEffect } from 'react';
import { PROBE_START_DELAY_MS, tierFromProbe } from '../config/quality';
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
    // 앱이 막 뜨는 동안(내려받기·화면 만들기)에는 프레임이 일시적으로 떨어져 한 번 잰 값이 실제보다 낮게 나온다.
    // 한가해진 뒤 두 번 재서 높은 쪽을 쓴다. 한 번의 나쁜 측정이 기기에 저장되어 계속 저사양으로 시작하는 것을 막는다.
    const timer = setTimeout(() => {
      void (async () => {
        const first = await measureFps();
        const second = cancelled ? null : await measureFps();
        if (cancelled) return;
        const samples = [first, second].filter((fps): fps is number => fps !== null);
        if (samples.length === 0) return;
        dispatch(qualityProbed(tierFromProbe(Math.max(...samples), navigator.hardwareConcurrency)));
      })();
    }, PROBE_START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auto, dispatch]);
}
