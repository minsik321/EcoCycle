// 자동 로그인 브라우저 점검: 실제 Chromium에서 새로고침·브라우저를 다시 연 뒤에도 로그인이 유지되는지,
// 로그아웃 뒤에는 로그인 화면이 나오는지, 토큰이 브라우저 저장소·주소·document.cookie에 보이지 않는지 본다.
// scripts/integration.mjs가 모의 서버(CORS_ORIGINS에 앱 주소)와 앱(vite)을 띄운 뒤 runAuthReload를 부른다.
import { chromium } from 'playwright-core';

const COOKIE = 'ecocycle_rt';
const DAY_SEC = 24 * 60 * 60;

export async function runAuthReload({ exe, appUrl, apiBase }) {
  const failures = [];
  const check = (ok, label) => {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  };

  const browser = await chromium.launch({ executablePath: exe });
  /** 지금까지 본 토큰 문자열(액세스 토큰, 쿠키 값)과 요청 주소 */
  const seenTokens = new Set();
  const requestUrls = [];

  async function newContext(storageState) {
    const context = await browser.newContext(storageState ? { storageState } : {});
    // 3D 장면 대신 대시보드 홈으로 (이 점검과 무관한 무거운 그리기를 피한다. 토큰이 아닌 표시 설정)
    await context.addInitScript(() => {
      try {
        localStorage.setItem('ecocycle.homeMode', 'dashboard');
      } catch {
        // 저장소를 못 쓰면 3D 그대로
      }
    });
    context.on('request', (req) => requestUrls.push(req.url()));
    context.on('response', async (res) => {
      if (!/\/auth\/(login|refresh)$/.test(new URL(res.url()).pathname) || !res.ok()) return;
      try {
        const body = await res.json();
        if (body.accessToken) seenTokens.add(body.accessToken);
        if (body.refreshToken) seenTokens.add(body.refreshToken);
      } catch {
        // 본문이 없는 응답
      }
    });
    return context;
  }

  // 쿠키는 Path=/api/v1/auth라 그 아래 주소로 물어야 보인다
  const refreshCookie = async (context) => (await context.cookies(`${apiBase}/auth/refresh`)).find((c) => c.name === COOKIE);

  /** 브라우저를 닫았다 연 것처럼: 세션 쿠키(expires -1)는 버리고 지속 쿠키만 새 컨텍스트로 옮긴다 */
  async function reopenBrowser(context) {
    const state = await context.storageState();
    await context.close();
    return newContext({ ...state, cookies: state.cookies.filter((c) => c.expires !== -1) });
  }

  /** 주소가 /login으로 한 번이라도 바뀌었는지 (로그인 화면이 잠깐이라도 보였는지) */
  function watchLoginFlash(page) {
    const flashes = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && new URL(frame.url()).pathname.startsWith('/login')) flashes.push(frame.url());
    });
    return flashes;
  }

  async function login(page, remember) {
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('아이디').fill('operator');
    await page.getByLabel('비밀번호').fill('1234');
    const box = page.getByRole('checkbox', { name: '자동 로그인' });
    check(!(await box.isChecked()), '자동 로그인은 기본으로 꺼져 있다');
    if (remember) await box.check();
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  }

  /**
   * 새로고침하고 앱 시작 때의 세션 되살리기(POST /auth/refresh → GET /me)가 끝날 때까지 기다린다.
   * 끝나기 전에 다른 주소로 가면 리프레시 요청은 서버에 닿아 토큰이 교체됐는데 응답(새 쿠키)을 잃을 수 있다.
   * 시간에 기대지 않고 리프레시 응답과 "로그인 확인 중…" 화면이 걷히는 것을 기다린다.
   */
  async function reloadAndSettle(page, label) {
    const flashes = watchLoginFlash(page);
    const refreshed = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/auth/refresh') && res.request().method() === 'POST', {
      timeout: 30_000,
    });
    await page.reload();
    const res = await refreshed;
    await res.finished();
    await page.getByText('로그인 확인 중…').waitFor({ state: 'detached', timeout: 30_000 });
    check(res.ok() && flashes.length === 0 && !new URL(page.url()).pathname.startsWith('/login'), `${label}: 세션을 되살린다 (리프레시 ${res.status()})`);
  }

  async function expectSignedIn(page, label) {
    const flashes = watchLoginFlash(page);
    await page.goto(`${appUrl}/settings`);
    const ok = await page
      .getByRole('heading', { name: '설정' })
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    check(ok && new URL(page.url()).pathname === '/settings' && flashes.length === 0, `${label}: 로그인 화면 없이 그대로 들어간다`);
  }

  async function expectLoginScreen(page, label) {
    await page.goto(`${appUrl}/settings`);
    const ok = await page
      .getByLabel('아이디')
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    check(ok && new URL(page.url()).pathname === '/login', `${label}: 로그인 화면이 나온다`);
  }

  async function expectNoLeak(page, label) {
    const cookie = await refreshCookie(page.context());
    if (cookie) seenTokens.add(cookie.value);
    const dump = await page.evaluate(() => ({
      local: Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n'),
      session: Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join('\n'),
      cookie: document.cookie,
      href: location.href,
    }));
    const tokens = [...seenTokens].filter(Boolean);
    const leaks = tokens.filter(
      (t) => dump.local.includes(t) || dump.session.includes(t) || dump.href.includes(t) || requestUrls.some((u) => u.includes(t)),
    );
    check(tokens.length > 0 && leaks.length === 0, `${label}: 토큰 ${tokens.length}개가 localStorage·sessionStorage·주소 어디에도 없다`);
    check(!dump.cookie.includes(COOKIE), `${label}: 리프레시 쿠키는 스크립트(document.cookie)에서 보이지 않는다`);
  }

  // vite 개발 서버는 첫 접속 때 의존성을 다시 묶으며 페이지를 새로 고칠 수 있다. 한 번 열어 안정될 때까지 기다린다.
  async function warmUp() {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (let attempt = 1; ; attempt += 1) {
      try {
        await page.goto(`${appUrl}/login`, { waitUntil: 'load', timeout: 60_000 });
        await page.getByLabel('아이디').waitFor({ timeout: 30_000 });
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await page.waitForTimeout(2000);
      }
    }
    await context.close();
  }

  try {
    await warmUp();
    // 1) 자동 로그인 켬 → 새로고침 → 브라우저 다시 열기 → 로그아웃 → 새로고침
    let context = await newContext();
    let page = await context.newPage();
    await login(page, true);
    const persistent = await refreshCookie(context);
    check(
      persistent?.httpOnly === true &&
        persistent.secure === true &&
        persistent.sameSite === 'Lax' &&
        persistent.path === '/api/v1/auth' &&
        persistent.expires > Date.now() / 1000 + 13 * DAY_SEC,
      '자동 로그인: 리프레시 쿠키가 HttpOnly·Secure·SameSite=Lax·Path=/api/v1/auth, 14일짜리 지속 쿠키다',
    );
    if (failures.length) console.log('    받은 쿠키:', JSON.stringify({ ...persistent, value: '…' }));
    await reloadAndSettle(page, '자동 로그인 후 새로고침');
    await expectSignedIn(page, '자동 로그인 후 새로고침');
    await expectNoLeak(page, '자동 로그인 후 새로고침');

    context = await reopenBrowser(context);
    page = await context.newPage();
    await expectSignedIn(page, '자동 로그인 후 브라우저를 다시 염');

    // 설정 화면 본문의 로그아웃 (상단 바 메뉴에도 같은 이름의 버튼이 있다)
    await page.getByRole('main').getByRole('button', { name: '로그아웃' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30_000 });
    check(!(await refreshCookie(context)), '로그아웃: 리프레시 쿠키가 지워진다');
    await page.reload();
    await expectLoginScreen(page, '로그아웃 후 새로고침');
    await expectNoLeak(page, '로그아웃 후');
    await context.close();

    // 2) 자동 로그인 끔 → 새로고침은 유지(세션 쿠키) → 브라우저를 다시 열면 로그인 화면
    context = await newContext();
    page = await context.newPage();
    await login(page, false);
    const session = await refreshCookie(context);
    check(session?.httpOnly === true && session.expires === -1, '자동 로그인 끔: 세션 쿠키(브라우저를 닫으면 사라짐)');
    await reloadAndSettle(page, '자동 로그인 끔, 새로고침');
    await expectSignedIn(page, '자동 로그인 끔, 새로고침');
    context = await reopenBrowser(context);
    page = await context.newPage();
    await expectLoginScreen(page, '자동 로그인 끔, 브라우저를 다시 염');
    await context.close();
  } finally {
    await browser.close();
  }
  return failures;
}
