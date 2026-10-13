import { useEffect, useState } from 'react';

/**
 * 이 기기가 3D(WebGL)를 그릴 수 있는가. 그릴 수 없으면(오래된 기기, 그래픽 가속이 꺼진 브라우저 등) 홈은 2D 카드로 보여 준다.
 * 한 번만 확인하고 결과를 기억한다.
 */
let cached: boolean | null = null;

export function supportsWebGL(): boolean {
  if (cached !== null) return cached;
  cached = false;
  try {
    if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return cached;
    const canvas = document.createElement('canvas');
    cached = !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

/** 테스트용: 기억해 둔 확인 결과를 지운다 */
export function resetWebGLSupportCache(): void {
  cached = null;
}

/** 앱이 화면에 보이는가 (다른 탭·앱으로 가면 false). 숨겨지면 3D 그리기를 멈춘다. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}
