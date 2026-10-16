import type { Request, Response } from 'express';
import type { RecordPage } from '@ecocycle/shared';
import { RECORD_MAX_PAGE_SIZE, RECORD_SEARCH_MAX_LENGTH, matchesSearch } from '@ecocycle/shared';
import { sendError } from '../errors';

/**
 * 모든 `GET .../records` 엔드포인트가 함께 쓰는 페이지 나누기 (명세 6절 "기록 목록(페이지 나누기)").
 * 쿼리 `from`, `to`(ISO 8601, from < to), `page`(1부터), `pageSize`(1~100)를 검사해 틀리면 422,
 * 맞으면 `[from, to)` 구간의 기록을 최신 먼저로 정렬해 그 쪽만 `{ items, total, page, pageSize }`로 보낸다.
 * 선택 쿼리 `q`는 기간과 함께 적용한다: `searchOf`가 돌려준 값들 중 하나라도 검색어를 (공백·대소문자 무시) 포함하는 기록만 남긴다.
 * 기록을 만드는 쪽(sim)은 시각과 함께 기록 전체를 넘기기만 한다.
 */
export function sendRecordPage<T>(
  req: Request,
  res: Response,
  records: readonly T[],
  timeOf: (record: T) => string,
  searchOf: (record: T) => ReadonlyArray<string | null | undefined> = () => [],
): void {
  const { from, to, page, pageSize } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string' || typeof page !== 'string' || typeof pageSize !== 'string') {
    return sendError(res, 422, 'VALIDATION_FAILED', 'from, to, page, pageSize가 필요합니다.');
  }
  const q = parseSearch(req.query.q);
  if (q === null) return sendError(res, 422, 'VALIDATION_FAILED', `q는 ${RECORD_SEARCH_MAX_LENGTH}자 이하의 글이어야 합니다.`);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'from, to는 from < to인 ISO 8601 시각이어야 합니다.');
  }
  const pageNo = Number(page);
  const size = Number(pageSize);
  if (!Number.isInteger(pageNo) || pageNo < 1 || !Number.isInteger(size) || size < 1 || size > RECORD_MAX_PAGE_SIZE) {
    return sendError(res, 422, 'VALIDATION_FAILED', `page는 1 이상, pageSize는 1~${RECORD_MAX_PAGE_SIZE}의 정수여야 합니다.`);
  }
  const inRange = records
    .map((record) => ({ record, ms: Date.parse(timeOf(record)) }))
    .filter(({ ms }) => ms >= fromMs && ms < toMs)
    .filter(({ record }) => matchesSearch(q, searchOf(record)))
    .sort((a, b) => b.ms - a.ms);
  const start = (pageNo - 1) * size;
  const body: RecordPage<T> = {
    items: inRange.slice(start, start + size).map(({ record }) => record),
    total: inRange.length,
    page: pageNo,
    pageSize: size,
  };
  res.json(body);
}

/** `q` 쿼리: 없으면 빈 글(거르지 않음), 글이 아니거나 너무 길면 null(422) */
export function parseSearch(value: unknown): string | null {
  if (value === undefined) return '';
  return typeof value === 'string' && value.length <= RECORD_SEARCH_MAX_LENGTH ? value : null;
}
