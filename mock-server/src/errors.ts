import type { Response } from 'express';
import type { ApiErrorBody, ApiErrorStatus } from '@ecocycle/shared';

/** 명세의 오류 형식: {"error":{"code","message"}} */
export function sendError(res: Response, status: ApiErrorStatus, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}
