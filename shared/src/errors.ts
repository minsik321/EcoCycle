/** 오류 형식: {"error":{"code":"FORBIDDEN","message":"..."}} — code 목록은 서버와 합의 전이라 문자열로 둔다. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** 클라이언트가 구분해서 처리하는 상태 코드 */
export const API_ERROR_STATUSES = [401, 403, 404, 409, 422, 429, 503] as const;
export type ApiErrorStatus = (typeof API_ERROR_STATUSES)[number];
