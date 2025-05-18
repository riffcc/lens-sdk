import type { ILensService } from './src/types';

declare global {
  interface Window {
    electronPeerbit: ILensService;
  }
}

// Adding an empty export makes this a module, ensuring it doesn't pollute the global scope
// in unintended ways, though for `declare global` it's often not strictly necessary.
// It's good practice for .d.ts files that might have their own top-level imports/exports.
export {};