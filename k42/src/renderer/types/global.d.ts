import type { Api } from '../../main/preload';
import type { IpcChannel } from '@shared/index';

declare global {
  interface Window {
    api: Api;
    electronAPI?: {
      send: (channel: IpcChannel, ...args: unknown[]) => void;
      on: (channel: IpcChannel, callback: (event: unknown, ...args: unknown[]) => void) => void;
      removeListener: (channel: IpcChannel, callback: (event: unknown, ...args: unknown[]) => void) => void;
    };
  }
}

export {};
