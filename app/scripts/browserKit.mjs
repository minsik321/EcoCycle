// 브라우저 점검 스크립트(textcheck, loadtime)가 함께 쓰는 도구: 이 컴퓨터의 Chromium 찾기, npm 스크립트로 서버 띄우기.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';

/** Chromium 실행 파일: CHROMIUM_PATH, 없으면 Playwright 브라우저 폴더(ms-playwright/chromium-*). 내려받지 않는다 */
export function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'AppData/Local/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const exe of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const full = path.join(root, dir, exe);
        if (fs.existsSync(full)) return full;
      }
    }
    if (fs.existsSync(path.join(root, 'chromium'))) return path.join(root, 'chromium');
  }
  return null;
}

export function start(name, args, cwd, env, readyText) {
  const child = spawn('npm', args, { cwd, shell: true, detached: !isWindows, env: { ...process.env, ...env } });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}가 40초 안에 시작되지 않았습니다.`)), 40_000);
    const onData = (chunk) => {
      if (String(chunk).replace(/\x1b\[[0-9;]*m/g, '').includes(readyText)) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`${name}가 먼저 끝났습니다 (코드 ${code}).`)));
  });
  const stop = () => {
    if (!child.pid) return;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid);
      } catch {
        // 이미 끝났다
      }
    }
  };
  return { ready, stop };
}
