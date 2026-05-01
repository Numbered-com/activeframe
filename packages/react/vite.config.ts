import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
      plugins: [react()],
    };
  }

  return {
    root: packageRoot,
    publicDir: false,
    plugins: [react(), dts({ rollupTypes: true })],
    build: {
      lib: {
        entry: resolve(packageRoot, 'src/index.ts'),
        formats: ['es'],
        fileName: () => 'activeframe-react.js',
      },
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      target: 'es2022',
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@numbered/activeframe'],
      },
    },
  };
});
