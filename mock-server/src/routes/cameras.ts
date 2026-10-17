import { Router } from 'express';
import type { CameraListResponse, StreamInfo } from '@ecocycle/shared';
import { sendError } from '../errors';
import { CAMERAS, SAMPLE_HLS_URL } from '../fixtures/cameras';

export const camerasRouter = Router();

camerasRouter.get('/cameras', (_req, res) => {
  const body: CameraListResponse = CAMERAS;
  res.json(body);
});

// 실서버는 만료되는 서명 주소를 준다. 모의 서버는 고정 샘플 주소에 5분 만료 시각만 붙인다.
camerasRouter.get('/cameras/:id/stream', (req, res) => {
  if (!CAMERAS.some((c) => c.id === req.params.id)) {
    return sendError(res, 422, 'VALIDATION_FAILED', `알 수 없는 카메라 ID: ${req.params.id}`);
  }
  const body: StreamInfo = {
    protocol: 'hls',
    url: SAMPLE_HLS_URL,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
  res.json(body);
});

// 정지 화면(JPEG)은 모의 서버에 이미지가 없어 아직 제공하지 않는다.
camerasRouter.get('/cameras/:id/snapshot', (_req, res) => {
  sendError(res, 503, 'NOT_IMPLEMENTED', '모의 서버는 스냅샷을 제공하지 않습니다.');
});
