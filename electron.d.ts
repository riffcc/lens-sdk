import type { ILensService } from './src/types';

declare global {
  interface Window {
    electronLensService: ILensService;
  }
}

export {};