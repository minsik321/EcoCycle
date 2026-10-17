import type { Camera } from '@ecocycle/shared';

export const CAMERAS: Camera[] = [
  { id: 'cam-1', name: '섹터 구역', location: 'A·B 섹터 전경' },
  { id: 'cam-2', name: '컨베이어·압축기', location: 'Section Z' },
];

// 모의 서버는 영상 변환을 하지 않는다. 공개 HLS 테스트 영상을 고정 샘플로 쓴다.
export const SAMPLE_HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
