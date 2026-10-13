import express from 'express';
import cors from 'cors';
import { authRouter } from './auth';
import { config } from './config';
import { sendError } from './errors';

const app = express();

app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : true }));
app.use(express.json());

// 기본 주소: /api/v1
app.use('/api/v1', authRouter);

// 명세에 없는 경로. 오류 상태는 명세 표(401/403/409/422/429/503)만 쓰므로 503으로 응답한다.
app.use((_req, res) => sendError(res, 503, 'NOT_IMPLEMENTED', '아직 구현되지 않았거나 없는 경로입니다.'));

app.listen(config.port, () => {
  console.log(`[mock-server] http://localhost:${config.port}/api/v1  시나리오: ${config.scenario}`);
});
