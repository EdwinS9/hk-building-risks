/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MAPTILER_KEY?: string;
  /** OSRM base URL for real-road routing. Defaults to the public demo server. */
  readonly VITE_OSRM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
