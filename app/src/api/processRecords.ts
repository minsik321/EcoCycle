import type { BatchRecord, VehicleRecord } from '@ecocycle/shared';
import { request } from './http';

// 공정 기록 한 건 (명세 6절 "공정 기록"). 목록은 `getRecords('/vehicles/records' | '/batches/records', query)`로 받는다 (records.ts).

/** 차량 기록 한 건. 없으면 404(`ApiError.status`) */
export const getVehicleRecord = (id: string, signal?: AbortSignal): Promise<VehicleRecord> =>
  request<VehicleRecord>(`/vehicles/${encodeURIComponent(id)}`, signal ? { signal } : {});

/** 배치 기록 한 건. 없으면 404 */
export const getBatchRecord = (id: string, signal?: AbortSignal): Promise<BatchRecord> =>
  request<BatchRecord>(`/batches/${encodeURIComponent(id)}`, signal ? { signal } : {});
