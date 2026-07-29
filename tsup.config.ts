import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: 'esm',
  clean: true,
  target: 'es2022',
  outDir: 'dist/cli',
  dts: false,
  sourcemap: false,
});
