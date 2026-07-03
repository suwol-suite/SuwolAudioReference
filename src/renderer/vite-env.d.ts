/// <reference types="vite/client" />

import type { SuwolAudioApi } from "../shared/ipc-types";

declare global {
  interface Window {
    suwolAudio: SuwolAudioApi;
  }
}

export {};
