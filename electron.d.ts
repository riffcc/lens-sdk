import type { ILensService } from './src/services/types.ts';

declare global {
  interface Window {
    electronLensService: ILensService;
  }
}

export {};
