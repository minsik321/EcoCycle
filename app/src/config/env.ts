// import.meta.env를 읽는 유일한 곳. 다른 파일은 여기서 가져다 쓴다.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api/v1';
export const WS_BASE: string = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:4000/ws/v1/stream';
export const USE_MOCK: boolean = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true';
