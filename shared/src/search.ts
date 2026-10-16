import type { DeviceId, TankId } from './ids';
import type { BatchEvent } from './process';

/*
 * 기록 검색 (명세 6절 "기록 목록"의 `q`). 검색은 서버가 한다 — 이 파일은 그 규칙을 한 곳에 적어 모의 서버와 테스트가 함께 쓴다.
 * 대소문자를 가리지 않고, 부분 일치이고, 공백은 검색어와 값 양쪽에서 무시한다("12가3456"이 "12가 3456"을 찾는다).
 */

/** 검색어 길이 상한. 넘으면 422 */
export const RECORD_SEARCH_MAX_LENGTH = 64;

/** 비교용으로 다듬는다: 모든 공백을 없애고 소문자로 */
export const normalizeSearch = (text: string): string => text.replace(/\s+/g, '').toLowerCase();

/** 값들 중 하나라도 검색어를 (공백·대소문자 무시) 포함하면 참. 검색어가 비어 있으면 늘 참 */
export function matchesSearch(q: string | undefined, values: ReadonlyArray<string | null | undefined>): boolean {
  const needle = normalizeSearch(q ?? '');
  if (needle === '') return true;
  return values.some((value) => value != null && normalizeSearch(value).includes(needle));
}

/** 섹터가 찾아지는 이름들: 코드(`tank-a1`), 짧은 이름(`A1`), 화면 이름(`섹터 A1`) */
export const sectorSearchTerms = (id: TankId): string[] => {
  const short = id.replace('tank-', '').toUpperCase();
  return [id, short, `섹터 ${short}`];
};

/** 기기가 찾아지는 이름들(화면에 적는 이름과 같다) */
export const DEVICE_SEARCH_NAMES: Record<DeviceId, string> = {
  'tank-a1': '섹터 A1',
  'tank-a2': '섹터 A2',
  'tank-b1': '섹터 B1',
  'tank-b2': '섹터 B2',
  'robot-1': '로봇팔',
  'conveyor-z': '컨베이어 Section Z',
  'compressor-1': '압축기',
};

/** 배치·베일 사건 종류의 화면 이름. 사건 종류 검색이 이 이름을 찾는다 */
export const BATCH_EVENT_TYPE_TEXT: Record<BatchEvent['type'], string> = {
  created: '배치 생성',
  mix_changed: '배합 변경',
  pressure_changed: '압력 변경',
  paused: '일시정지',
  resumed: '재개',
  skipped: '건너뜀',
  bale_produced: '베일 생산',
};
