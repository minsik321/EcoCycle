import type { CameraListResponse, StreamInfo } from '@ecocycle/shared';
import { request } from './http';

export const getCameras = (): Promise<CameraListResponse> => request<CameraListResponse>('/cameras');

/** 만료되는 서명 주소를 받는다. 앱은 이 주소를 <video>로 재생하기만 한다. */
export const getStreamInfo = (cameraId: string): Promise<StreamInfo> =>
  request<StreamInfo>(`/cameras/${cameraId}/stream`);

/**
 * 정지 화면(JPEG). <img src>는 토큰 헤더를 보낼 수 없고 토큰을 주소에 넣지 않으므로 Blob으로 받는다.
 * 화면에서는 URL.createObjectURL(blob)로 보여 주고 다 쓰면 revokeObjectURL로 해제한다.
 */
export const getSnapshotBlob = (cameraId: string): Promise<Blob> =>
  request<Blob>(`/cameras/${cameraId}/snapshot`, { responseType: 'blob' });
