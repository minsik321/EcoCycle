// 글 줄바꿈 점검에 쓰는 함수. 브라우저 페이지 안에서 돈다(page.evaluate로 넘긴다). 바깥 변수를 쓰지 않는다.

/**
 * 화면에 보이는 글 가운데
 *  - 짧은 글(12자 이하: 이름표·칩·탭·값)이 두 줄 이상으로 꺾인 것
 *  - 한 낱말이 중간에서 잘려 다음 줄로 넘어간 것(한국어 "수분"이 "수/분"이 되는 것)
 * 을 찾는다. 화면 읽기 전용 글(.sr-only, .st-sr)은 뺀다.
 */
export function findWrappedText() {
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || seen.has(el)) continue;
    if (el.closest('.sr-only, .st-sr')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const box = el.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const tops = [];
    for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
    if (tops.length < 2) continue;
    // 줄이 바뀌는 자리의 앞 글자가 공백이 아니면 낱말 중간에서 잘린 것이다
    let midWord = false;
    const raw = node.textContent;
    let prevTop = null;
    for (let i = 0; i < raw.length; i += 1) {
      if (/\s/.test(raw[i])) continue;
      const one = document.createRange();
      one.setStart(node, i);
      one.setEnd(node, i + 1);
      const r = one.getClientRects()[0];
      if (!r) continue;
      if (prevTop !== null && r.top - prevTop > r.height / 2 && i > 0 && !/\s/.test(raw[i - 1]) && !/[-–·/:,]/.test(raw[i - 1])) midWord = true;
      prevTop = r.top;
    }
    if (text.length <= 12 || midWord) {
      seen.add(el);
      out.push({ text: text.slice(0, 40), lines: tops.length, midWord, width: Math.round(box.width) });
    }
  }
  return out;
}

/**
 * 안드로이드 "글자 크기" 설정(웹뷰 textZoom)처럼 글자만 키운다. 상자 폭은 그대로.
 * 화면이 바뀐 뒤 다시 불러도 된다: 이미 키운 요소는 건너뛰고, 키운 부모의 글자 크기를 그대로 물려받은 새 요소는 다시 키우지 않는다.
 */
export function zoomText(factor) {
  const all = [...document.querySelectorAll('body *')].filter((el) => !el.dataset.textZoom);
  const sizes = all.map((el) => {
    const own = parseFloat(getComputedStyle(el).fontSize);
    const parent = el.parentElement;
    const inherited = parent?.dataset.textZoom && Math.abs(parseFloat(getComputedStyle(parent).fontSize) - own) < 0.01;
    return inherited ? own : own * factor;
  });
  all.forEach((el, i) => {
    el.style.fontSize = `${sizes[i]}px`;
    el.dataset.textZoom = '1';
  });
}
