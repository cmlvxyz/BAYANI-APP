/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Maps JavaScript API key (Maps JavaScript API + Street View). */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Base URL of the Bayani Bridge backend (SSE + DB). */
  readonly VITE_BRIDGE_URL?: string;
  /** Contact shown in the Privacy section of Settings. */
  readonly VITE_PRIVACY_CONTACT?: string;
  /** Data protection officer shown in the Privacy section of Settings. */
  readonly VITE_PRIVACY_OFFICER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}