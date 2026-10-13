import type {
  DeviceId,
  DeviceListResponse,
  DeviceState,
  HistoryResponse,
  PlantSummary,
  RobotId,
  RobotModel,
} from '@ecocycle/shared';
import { request } from './http';

export const getPlantSummary = (): Promise<PlantSummary> => request<PlantSummary>('/plant/summary');

export const getDevices = (): Promise<DeviceListResponse> => request<DeviceListResponse>('/devices');

export const getDeviceState = (id: DeviceId): Promise<DeviceState> => request<DeviceState>(`/devices/${id}/state`);

export interface HistoryQuery {
  deviceId: DeviceId;
  metric: string;
  /** ISO 8601 UTC */
  from: string;
  to: string;
  /** 예: 10m, 1h, 6h */
  interval: string;
}

export const getHistory = ({ deviceId, ...query }: HistoryQuery, signal?: AbortSignal): Promise<HistoryResponse> =>
  request<HistoryResponse>(`/devices/${deviceId}/history`, { query, ...(signal ? { signal } : {}) });

export const getRobotModel = (id: RobotId): Promise<RobotModel> => request<RobotModel>(`/robots/${id}/model`);
