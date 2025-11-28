/// <reference types="vite/client" />

interface ElectronAPI {
  send: (channel: string, ...args: unknown[]) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI | undefined;
}
