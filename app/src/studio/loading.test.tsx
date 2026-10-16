import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { API_BASE, WS_BASE } from '../config/env';
import { renderWithStore } from '../test/utils';
import { PosterStudio } from './DemoStudio';
import { MODELS, MODEL_BASE } from './modelList';
import { POSTER, STUDIO_FILES_META, claimStudioFiles, connectionAllowsPrefetch, prefetchStudio, resetStudioPrefetch, studioPrefetchUrls } from './preload';
import type { StudioSceneProps } from './StudioScene';
import { SCENE_START, StudioView } from './StudioView';
import { demoData } from './demo/demoData';
import { fixedSource } from './robot/jointSource';
import { EMPTY_DATA } from './types';

// 3D 홈 첫 화면: 패널은 3D 조각을 기다리지 않고 바로 그려지고, 그 아래에 빈 장면 포스터와 "준비하는 중"이 깔린다.
// 3D 조각·모델·포스터는 로그인 화면에서 미리 받되 정적 파일만 받는다(API·WebSocket 없음).

const scene = vi.hoisted(() => ({ mode: 'suspend' as 'suspend' | 'render', last: null as StudioSceneProps | null }));
vi.mock('./StudioScene', () => ({
  default: (props: StudioSceneProps) => {
    // suspend: 3D 조각이 아직 오지 않은 상태 (끝나지 않는 약속으로 계속 기다린다)
    if (scene.mode === 'suspend') throw new Promise(() => {});
    scene.last = props;
    return <div data-testid="scene" />;
  },
}));
vi.mock('../features/home/sceneSupport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/home/sceneSupport')>()),
  supportsWebGL: () => true,
}));

const src = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(file, 'utf8');

/** 정적 import만 따라가며 닿는 파일과 바깥 패키지를 모은다 (lazy(() => import(...))와 import type은 뺀다) */
function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const m of read(file).matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'|^import\s+'([^']+)'/gm)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      if (!spec.startsWith('.')) {
        packages.add(spec);
        continue;
      }
      const base = path.resolve(path.dirname(file), spec);
      const found = ['', '.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((p) => readdirSync(path.dirname(p)).includes(path.basename(p)) && !p.endsWith('.css'));
      if (found) queue.push(found);
    }
  }
  return { files, packages };
}

const THREE = /^(three|@react-three\/|postprocessing|n8ao)/;

describe('패널은 3D 조각을 기다리지 않는다', () => {
  it('스튜디오 입구(패널 조각)와 미리 받기는 three를 정적으로 부르지 않는다. three는 StudioScene 조각에서부터다', () => {
    for (const entry of ['studio/index.ts', 'studio/preload.ts', 'features/home/useStudioPrefetch.ts']) {
      const { files, packages } = staticGraph(path.join(src, entry));
      expect([...packages].filter((p) => THREE.test(p)), entry).toEqual([]);
      expect([...files].map((f) => path.basename(f)), entry).not.toContain('Stage.tsx');
    }
    expect(read(path.join(src, 'studio/StudioView.tsx'))).toMatch(/lazy\(\(\) => import\('\.\/StudioScene'\)\)/);
  });

  it('features/home이 studio에서 정적으로 부르는 것은 three 없는 stats와 preload뿐이다', () => {
    const dir = path.join(src, 'features/home');
    const allowed = new Set(['three/stats', 'preload']);
    for (const name of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))) {
      for (const [, spec] of read(path.join(dir, name)).matchAll(/^import\s+(?!type\b)[^;]*?from\s+'\.\.\/\.\.\/studio\/?([^']*)'/gm)) {
        expect(allowed.has(spec ?? ''), `${name}: studio/${spec}`).toBe(true);
      }
    }
  });

  describe('3D 장면은 지표가 그려진 뒤에 올린다 (느린 폰에서 장면 만들기가 지표를 늦추지 않게)', () => {
    const props = { jointSource: fixedSource(), tier: 'low' as const, lastReceivedAt: null, paused: false, onFailed: () => {} };
    beforeEach(() => {
      scene.mode = 'render';
      scene.last = null;
    });

    it('첫 값이 오기 전에는 장면을 올리지 않고(파일은 받기 시작한다), 값이 오면 그 화면을 그린 다음 올린다', async () => {
      resetStudioPrefetch();
      const { rerender } = render(<StudioView {...props} data={EMPTY_DATA} disconnected={false} />);
      await act(() => new Promise((r) => setTimeout(r, 50)));
      expect(screen.queryByTestId('scene')).toBeNull();
      expect(document.head.querySelector(`link[rel="prefetch"][href="${MODEL_BASE + MODELS['car-van'].file}"]`)).not.toBeNull();
      rerender(<StudioView {...props} data={demoData(Date.now(), 30)} disconnected={false} />);
      // 같은 그리기에서는 아직 없다: 지표가 먼저 나간다
      expect(screen.queryByTestId('scene')).toBeNull();
      expect(document.querySelector('.st-kpi-value')?.textContent).toMatch(/\d/);
      await screen.findByTestId('scene');
    });

    it('값이 끝내 오지 않으면 정해진 시간 뒤에 그냥 올린다', async () => {
      const before = SCENE_START.waitMs;
      SCENE_START.waitMs = 60;
      try {
        render(<StudioView {...props} data={EMPTY_DATA} disconnected={false} />);
        expect(screen.queryByTestId('scene')).toBeNull();
        await waitFor(() => expect(screen.getByTestId('scene')).toBeInTheDocument());
      } finally {
        SCENE_START.waitMs = before;
      }
    });

    it('연결이 끊긴 채로 열면 (값이 오지 않아도) 바로 올려 멈춘 장면과 "연결 끊김"을 보여 준다', async () => {
      render(<StudioView {...props} data={EMPTY_DATA} disconnected />);
      await screen.findByTestId('scene');
      expect(scene.last?.frozen).toBe(true);
    });
  });

  describe('3D 조각이 오기 전', () => {
    beforeEach(() => {
      scene.mode = 'suspend';
    });

    it('지표·상단 바·시트는 store 값으로 바로 보이고, 그 아래에 포스터·돌림표·"3D 장면을 준비하는 중…"이 깔린다', async () => {
      const user = userEvent.setup();
      render(<StudioView data={demoData(Date.now(), 30)} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={null} paused={false} onFailed={() => {}} />);
      const loading = screen.getByRole('status', { name: '3D 장면을 준비하는 중' });
      expect(loading).toHaveTextContent('3D 장면을 준비하는 중…');
      expect(loading.querySelector('.st-spinner')).not.toBeNull();
      expect(loading.querySelector('.st-poster-frost')).not.toBeNull();
      expect(loading.querySelector('img')?.getAttribute('src')).toBe(POSTER.wide);
      expect(loading.querySelector('source')?.getAttribute('srcset')).toBe(POSTER.tall);
      // 지표 숫자가 이미 보인다 (3D를 기다리지 않는다)
      const kpi = screen.getByRole('region', { name: '오늘 생산 베일' });
      expect(kpi.querySelector('.st-kpi-value')?.textContent).toMatch(/\d/);
      // 패널은 누를 수 있다: 지역 전환 목록을 연다 (3D가 없어도 화면이 막히지 않는다)
      await user.click(screen.getByRole('button', { name: '지역: 섹터·로봇·압축' }));
      expect(within(screen.getByRole('listbox', { name: '카메라 지역' })).getByRole('option', { name: /부지 전체/ })).toBeInTheDocument();
      // 핀은 3D 장면이 자리를 계산해 줄 때까지 놓지 않는다
      expect(document.querySelector('.st-pins')).toBeNull();
    });
  });
});

describe('포스터는 빈 장면만 담는다', () => {
  beforeEach(() => {
    scene.mode = 'render';
    scene.last = null;
  });

  it('포스터 화면(PosterStudio)은 빈 데이터·기본 자세로 3D만 그리고 글자·패널·핀이 하나도 없다', async () => {
    const { container } = render(<PosterStudio onFailed={() => {}} />);
    await screen.findByTestId('scene');
    expect(scene.last?.data).toBe(EMPTY_DATA);
    expect(EMPTY_DATA.vehicles).toEqual([]);
    expect(EMPTY_DATA.bales).toEqual([]);
    expect(EMPTY_DATA.summary).toBeNull();
    expect(scene.last?.jointSource.kind).toBe('fixed');
    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-topbar], .st-area-dock, .st-kpis, .st-pins, .st-sheet, .st-detail, .st-poster')).toBeNull();
  });

  it('포스터를 찍는 스크립트는 그 빈 장면 화면을 찍고, 화면에 글자가 있으면 멈춘다', () => {
    const script = read(path.resolve(src, '../scripts/poster.mjs'));
    expect(script).toContain('/scene-demo?poster=1');
    expect(script).toMatch(/innerText[\s\S]*throw new Error/);
    for (const file of [POSTER.wide, POSTER.tall]) expect(script).toContain(path.basename(file));
  });
});

describe('3D 홈 미리 받기 (정적 파일만)', () => {
  const links = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"], link[rel="modulepreload"]')].map((l) => l.getAttribute('href'));
  let fetchSpy: ReturnType<typeof vi.fn>;
  let socketSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetStudioPrefetch();
    document.head.querySelectorAll('link[rel="prefetch"], link[rel="modulepreload"], meta').forEach((n) => n.remove());
    const meta = document.createElement('meta');
    meta.name = STUDIO_FILES_META;
    meta.content = '/assets/studio-a.css /assets/studio-b.js /assets/StudioScene-c.js';
    document.head.appendChild(meta);
    fetchSpy = vi.fn(() => new Promise(() => {}));
    socketSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('WebSocket', socketSpy);
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0));
    vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    // 화면을 먼저 내린다 (한가할 때 받기 취소가 바꿔 둔 requestIdleCallback을 쓴다)
    cleanup();
    vi.unstubAllGlobals();
  });

  it('데이터 절약 모드나 2G에서는 받지 않는다', () => {
    expect(connectionAllowsPrefetch(undefined)).toBe(true);
    expect(connectionAllowsPrefetch({ effectiveType: '4g' })).toBe(true);
    expect(connectionAllowsPrefetch({ effectiveType: '3g' })).toBe(true);
    expect(connectionAllowsPrefetch({ effectiveType: '2g' })).toBe(false);
    expect(connectionAllowsPrefetch({ effectiveType: 'slow-2g' })).toBe(false);
    expect(connectionAllowsPrefetch({ effectiveType: '4g', saveData: true })).toBe(false);
  });

  it('받는 것은 이 앱의 공개 정적 파일뿐이다: 빌드가 적은 3D 조각, 모델, 화면 방향에 맞는 포스터 한 장', () => {
    const urls = studioPrefetchUrls();
    expect(urls).toEqual(expect.arrayContaining(['/assets/studio-a.css', '/assets/studio-b.js', '/assets/StudioScene-c.js', ...Object.values(MODELS).map((m) => MODEL_BASE + m.file)]));
    expect(urls.filter((u) => u.startsWith('/studio/'))).toHaveLength(1);
    for (const url of urls) {
      expect(url).toMatch(/^\/(assets|models|studio)\//);
      expect(url).not.toContain(new URL(API_BASE).pathname);
      expect(url).not.toContain(new URL(WS_BASE).pathname);
    }
  });

  it('JS 조각은 실행하지 않고 받아 두기만 하며(modulepreload, import()가 이어 쓴다), 나머지는 낮은 우선순위로 받는다', () => {
    prefetchStudio();
    const rel = (href: string) => document.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    expect(rel('/assets/StudioScene-c.js')?.rel).toBe('modulepreload');
    expect(rel('/assets/StudioScene-c.js')?.getAttribute('crossorigin')).toBe('');
    expect(rel('/assets/studio-a.css')?.rel).toBe('prefetch');
    expect(rel(MODEL_BASE + MODELS['car-van'].file)?.rel).toBe('prefetch');
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('한 번만 받는다', () => {
    expect(prefetchStudio()).toBe(true);
    const first = links().length;
    expect(prefetchStudio(document, { force: true })).toBe(false);
    expect(links()).toHaveLength(first);
  });

  it('3D 홈이 열려 있으면 앱 틀의 "한가할 때 받기"는 물러서고, 패널이 뜬 뒤 홈(force)이 받는다', () => {
    claimStudioFiles();
    expect(prefetchStudio()).toBe(false);
    expect(links()).toEqual([]);
    expect(prefetchStudio(document, { force: true })).toBe(true);
  });

  it('3D 홈을 여는 중이면(force) 데이터 절약 모드여도 받는다 (어차피 필요한 파일이다)', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    expect(prefetchStudio()).toBe(false);
    expect(prefetchStudio(document, { force: true })).toBe(true);
  });

  it('로그인 화면: 홈을 3D로 기억했으면 한가할 때 정적 파일만 미리 받고, API·WebSocket은 부르지 않는다', async () => {
    localStorage.setItem('ecocycle.homeMode', '3d');
    renderWithStore(<App />, { me: null, route: '/login' });
    expect(screen.getByLabelText('아이디')).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(links()).toEqual(studioPrefetchUrls());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });

  it('로그인 화면: 홈을 대시보드로 기억했으면 받지 않는다', async () => {
    localStorage.setItem('ecocycle.homeMode', 'dashboard');
    renderWithStore(<App />, { me: null, route: '/login' });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(links()).toEqual([]);
  });

  it('데이터 절약 모드면 로그인 화면에서도 받지 않는다', async () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true, effectiveType: '4g' } });
    localStorage.setItem('ecocycle.homeMode', '3d');
    renderWithStore(<App />, { me: null, route: '/login' });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(links()).toEqual([]);
  });
});
