import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, visibleNavItems } from './navigation';

describe('navigation', () => {
  it('메뉴 순서는 홈, 탱크, 로봇팔, 컨베이어, 압축기, 알람, 설정이다', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['홈', '탱크', '로봇팔', '컨베이어', '압축기', '알람', '설정']);
  });

  it('권한 요구가 없는 메뉴는 권한이 없어도 보인다', () => {
    expect(visibleNavItems([])).toHaveLength(NAV_ITEMS.length);
  });
});
