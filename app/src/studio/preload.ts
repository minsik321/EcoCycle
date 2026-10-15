import { MODELS, MODEL_BASE } from './modelList';

// 3D 홈 미리 받기: 로그인 화면을 보는 동안, 그리고 로그인 뒤 한가할 때 3D 조각·모델·포스터를 브라우저 캐시에 받아 둔다.
// three를 import하지 않는 작은 파일이라 메인 묶음에 들어간다(앱 틀이 부른다).
//  - 정적 파일만 받는다: 빌드가 index.html에 적어 둔 3D 조각 목록(meta), public/models의 모델, public/studio의 포스터.
//    API·WebSocket은 부르지 않는다(로그인 전에는 서버에 아무것도 묻지 않는다).
//  - JS 조각은 <link rel="modulepreload">: 받고 읽어 두기만 하고 실행하지 않는다(three를 미리 실행하지 않으므로 입력이 끊기지 않는다).
//    prefetch로 받으면, 다 받기 전에 로그인해 홈이 import()하는 순간 같은 파일을 처음부터 또 받는다(측정: 1.4MB를 두 번).
//    modulepreload는 모듈 지도에 들어가 import()가 받는 중인 것을 그대로 이어 쓴다.
//  - CSS·모델·포스터는 작아서 <link rel="prefetch">(가장 낮은 우선순위)로 HTTP 캐시에 받아 둔다.
//  - 데이터 절약 모드이거나 2G면 받지 않는다. 받을지(홈을 3D로 기억했는지, 3D를 그릴 수 있는지)는 부르는 쪽이 정한다.

/** 3D 장면이 준비될 때까지 덮는 포스터 (빈 장면, scripts/poster.mjs로 찍는다) */
export const POSTER = {
  tall: '/studio/poster-tall.jpg',
  wide: '/studio/poster-wide.jpg',
  /** 이 조건이면 세로 포스터 (StudioView의 <picture>와 같은 조건) */
  portraitQuery: '(orientation: portrait)',
} as const;

/** 빌드가 index.html에 넣는 3D 조각 목록 (vite.config.ts의 studioFilesMeta). 개발 서버에는 없다 */
export const STUDIO_FILES_META = 'ecocycle-studio-files';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** 지금 연결로 미리 받아도 되는가: 데이터 절약 모드나 2G(느린 2G 포함)면 받지 않는다 */
export function connectionAllowsPrefetch(connection: NetworkInformationLike | undefined = (navigator as { connection?: NetworkInformationLike }).connection): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/(^|-)2g$/.test(connection.effectiveType ?? '');
}

/** 미리 받을 정적 파일 주소. 모두 이 앱과 같은 출처의 공개 파일이다 */
export function studioPrefetchUrls(doc: Document = document): string[] {
  const chunks = (doc.querySelector<HTMLMetaElement>(`meta[name="${STUDIO_FILES_META}"]`)?.content ?? '').split(/\s+/).filter(Boolean);
  const models = Object.values(MODELS).map((m) => MODEL_BASE + m.file);
  const portrait = typeof matchMedia === 'function' && matchMedia(POSTER.portraitQuery).matches;
  return [...new Set([portrait ? POSTER.tall : POSTER.wide, ...chunks, ...models])].filter((url) => url.startsWith('/') && !url.startsWith('//'));
}

/** 파일을 이미 받기 시작했다 (한 번만 받는다) */
let started = false;
/** 3D 홈이 열려 자기가 받는다: 앱 틀의 "한가할 때 받기"는 물러선다 */
let claimed = false;

/**
 * 한 번만: 파일마다 <link>를 붙인다 (JS는 modulepreload, 나머지는 prefetch). 붙였으면 true.
 * force: 3D 홈의 패널이 떠서 지금 받아야 한다 (연결 조건·물러서기를 보지 않는다)
 */
export function prefetchStudio(doc: Document = document, { force = false }: { force?: boolean } = {}): boolean {
  if (started || (!force && (claimed || !connectionAllowsPrefetch()))) return false;
  started = true;
  for (const url of studioPrefetchUrls(doc)) {
    const link = doc.createElement('link');
    if (url.endsWith('.js')) {
      link.rel = 'modulepreload';
      // 앱의 모듈 스크립트(<script type="module" crossorigin>)와 같은 받기 설정이어야 import()가 이것을 쓴다
      link.crossOrigin = '';
    } else link.rel = 'prefetch';
    link.href = url;
    doc.head.appendChild(link);
  }
  return true;
}

/** 브라우저가 한가할 때 미리 받는다 (requestIdleCallback이 없으면 잠시 뒤). 취소 함수를 돌려준다 */
export function prefetchStudioWhenIdle(): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => prefetchStudio(), { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const timer = window.setTimeout(() => prefetchStudio(), 1500);
  return () => window.clearTimeout(timer);
}

/**
 * 3D 홈이 열렸다: 받기는 홈의 패널(StudioView)이 뜬 뒤에 시작한다. 그 전에 앱 틀이 한가하다고 받기 시작하면
 * 3D 조각(약 450KB)이 패널 조각·첫 값 요청과 대역을 나눠 지표가 늦어진다(측정).
 */
export function claimStudioFiles(): void {
  claimed = true;
}

/** 테스트용: 받기 표시를 지운다 */
export function resetStudioPrefetch(): void {
  started = false;
  claimed = false;
}
