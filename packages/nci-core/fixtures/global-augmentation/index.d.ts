export interface AppState {
  initialized: boolean;
}

export declare function initApp(): AppState;

declare global {
  interface Window {
    __APP_STATE__: AppState;
  }
}
