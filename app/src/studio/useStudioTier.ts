import { useEffect, useState } from 'react';
import type { QualityTier } from '../config/quality';
import { deviceClass, readDeviceHints, studioTier } from './quality';
import type { DeviceClass } from './quality';

/** 지금 기기 종류 (화면 크기가 바뀌면 다시 고른다: 회전, 창 크기) */
export function useDeviceClass(): DeviceClass {
  const [kind, setKind] = useState<DeviceClass>(() => (typeof window === 'undefined' ? 'desktop' : deviceClass(readDeviceHints())));
  useEffect(() => {
    const update = () => setKind(deviceClass(readDeviceHints()));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return kind;
}

/**
 * 스튜디오가 쓸 화질 단계와 기기 종류.
 * @param probed 접속 때 잰 프레임으로 고른 단계 (아직 못 쟀으면 null)
 * @param chosen 사용자가 직접 고른 단계 (없으면 null)
 */
export function useStudioTier(probed: QualityTier | null, chosen: QualityTier | null): { tier: QualityTier; device: DeviceClass } {
  const device = useDeviceClass();
  return { tier: studioTier(device, probed, chosen), device };
}
