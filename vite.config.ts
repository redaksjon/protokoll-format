import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'protokoll-format',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'better-sqlite3', 
        'diff', 
        'glob',
        'node:path', 
        'node:fs', 
        'node:fs/promises', 
        'node:crypto',
        'node:os',
        'node:url',
        'node:events',
        'node:stream',
        'node:string_decoder',
        'fs',
        'path',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    },
    target: 'node24',
    sourcemap: true,
    minify: false,
  },
});
