import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 글 줄바꿈 규칙이 빠지지 않았는지 (실제 화면에서 글이 꺾이는지는 브라우저로 보는 `npm run test:text`가 점검한다)

const read = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} 규칙`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('글 줄바꿈 규칙', () => {
  const app = read('index.css');
  const studio = read('../studio/studio.css');

  it('앱 전체: 한국어는 낱말 단위로만 줄을 바꾸고, 넘칠 때만 끊는다 (상자를 줄이는 anywhere는 쓰지 않는다)', () => {
    const html = block(app, 'html');
    expect(html).toContain('word-break: keep-all');
    expect(html).toContain('overflow-wrap: break-word');
    expect(app).not.toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('이름표·표 머리·탭·버튼은 한 줄', () => {
    const rule = block(app, ":where(dt, th, legend, label, button, [role='tab'], [role='status'] > *, summary)");
    expect(rule).toContain('white-space: nowrap');
  });

  it('3D 홈 패널: 이름·값 줄은 같은 기준선, 값은 말줄임, 폰 표는 좁으면 덜 중요한 칸을 뺀다', () => {
    expect(studio).toMatch(/\.st-rows > div \{\n {2}align-items: baseline;/);
    const dd = studio.slice(studio.lastIndexOf('.st-rows dd {'));
    expect(dd.slice(0, dd.indexOf('}'))).toContain('text-overflow: ellipsis');
    expect(studio).toMatch(/@container \(max-width: 380px\) \{\n {2}\.st-col-opt \{\n {4}display: none;/);
  });
});
