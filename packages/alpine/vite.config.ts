import { defineConfig, type UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

const packageRoot = __dirname;
const repoRoot = resolve(packageRoot, '../..');

export default defineConfig(({ command }): UserConfig => {
  if (command === 'serve') {
    return {
      root: packageRoot,
      publicDir: resolve(repoRoot, 'public'),
      server: { fs: { allow: [repoRoot] } },
    };
  }

  return {
    root: packageRoot,
    publicDir: false,
    plugins: [dts({ rollupTypes: true })],
    build: {
      lib: {
        entry: resolve(packageRoot, 'src/index.ts'),
        formats: ['es'],
        fileName: () => 'activeframe-alpine.js',
      },
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      target: 'es2022',
      rollupOptions: {
        external: ['alpinejs', '@numbered/activeframe'],
      },
    },
  };
});
