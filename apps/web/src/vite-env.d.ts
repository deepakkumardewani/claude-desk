/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CC_STUDIO_TOKEN?: string;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
