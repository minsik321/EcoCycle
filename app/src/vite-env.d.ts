/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_BASE?: string;
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 빌드할 때 package.json의 version이 들어간다 (vite.config.ts의 define) */
declare const __APP_VERSION__: string;
