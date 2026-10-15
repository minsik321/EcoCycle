import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './auth';
import { config } from './config';
import { sendError } from './errors';
import { queryRouter } from './routes';
import { restDelayMs, startScenario } from './scenarios';
import { startSim } from './sim';
import { attachStream } from './stream';

const app = express();

// 웹은 리프레시 토큰을 쿠키로 주고받으므로 credentials를 허용한다. 그래서 출처는 반드시 명시한 목록만 쓴다(* 불가).
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// slow-network 시나리오에서만 응답이 늦어진다
app.use((_req, _res, next) => {
  const delay = restDelayMs();
  if (delay > 0) setTimeout(() => next(), delay);
  else next();
});

// 기본 주소: /api/v1
app.use('/api/v1', authRouter);
app.use('/api/v1', queryRouter);

// 명세에 없는 경로. 오류 상태는 명세 표(401/403/409/422/429/503)만 쓰므로 503으로 응답한다.
app.use((_req, res) => sendError(res, 503, 'NOT_IMPLEMENTED', '아직 구현되지 않았거나 없는 경로입니다.'));

const server = createServer(app);
attachStream(server);
startSim();
startScenario();

server.listen(config.port, () => {
  console.log(`[mock-server] http://localhost:${config.port}/api/v1  시나리오: ${config.scenario}`);
  console.log(`  허용 출처: ${config.corsOrigins.join(', ')}  리프레시 쿠키 SameSite=${config.refreshCookieSameSite}`);
});
