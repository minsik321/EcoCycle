import type { BatchControlState, BaleDetail } from '@ecocycle/shared';
import { request } from './http';
export const getBatchControl = (signal: AbortSignal) => request<BatchControlState>('/batches/control', { signal });
export const getBaleDetail = (id: string, signal: AbortSignal) => request<BaleDetail>(`/bales/${encodeURIComponent(id)}`, { signal });
