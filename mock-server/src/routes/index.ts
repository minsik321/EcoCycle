import { Router } from 'express';
import { requireAuth } from '../auth';
import { alarmsRouter } from './alarms';
import { camerasRouter } from './cameras';
import { commandsRouter } from './commands';
import { devicesRouter } from './devices';
import { processRouter } from './process';
import { robotsRouter } from './robots';

/** 로그인이 필요한 조회 API 묶음. 권한 검증은 requireAuth가 맡는다. */
export const queryRouter = Router();

queryRouter.use(requireAuth);
queryRouter.use(devicesRouter);
queryRouter.use(processRouter);
queryRouter.use(robotsRouter);
queryRouter.use(alarmsRouter);
queryRouter.use(camerasRouter);
queryRouter.use(commandsRouter);
