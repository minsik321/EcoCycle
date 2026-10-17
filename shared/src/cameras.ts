import type { IsoTimestamp } from './common';

/** GET /cameras */
export interface Camera {
  id: string;
  name: string;
  location: string;
}

export type CameraListResponse = Camera[];

/** GET /cameras/{id}/stream — 주소는 만료되는 서명 주소다. */
export interface StreamInfo {
  protocol: 'hls' | 'webrtc';
  url: string;
  expiresAt: IsoTimestamp;
}
