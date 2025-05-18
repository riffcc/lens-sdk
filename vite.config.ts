import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true, 
    }),
  ],
  resolve: {
    alias: {
      '/@/': path.resolve(__dirname, './src/'),
    },
  },
  build: {
    sourcemap: true,
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'browser/index': path.resolve(__dirname, 'src/browser/index.ts'),
        'electron/index': path.resolve(__dirname, 'src/electron/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const extension = format === 'es' ? 'js' : 'cjs';
        return `${entryName}.${extension}`;
      },
    },
    rollupOptions: {
      // Externalize dependencies that shouldn't be bundled
      external: [
        '@dao-xyz/borsh',
        '@peerbit/crypto',
        '@peerbit/document',
        '@peerbit/identity-access-controller',
        '@peerbit/program',
        '@peerbit/shared-log',
        'peerbit',
        'uuid',
      ],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});