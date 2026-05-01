import { defineConfig, type Plugin, type UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

const packageRoot = __dirname;
const repoRoot = resolve(packageRoot, '../..');
const libEntry = resolve(packageRoot, 'src/index.ts');

// In dev, rewrite the prebuilt import in index.html to the TS source so the
// same HTML works for both `vite` (dev, HMR on src/) and the built dist/.
function devSourceAlias(): Plugin {
  return {
    name: 'activeframe-dev-source',
    apply: 'serve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './ActiveFrame.js' && importer && importer.includes('index.html')) {
        return libEntry;
      }
      return null;
    },
  };
}

export default defineConfig(({ command }): UserConfig => {
  if (command === 'serve') {
    return {
      root: packageRoot,
      publicDir: resolve(repoRoot, 'public'),
      server: { fs: { allow: [repoRoot] } },
      plugins: [devSourceAlias()],
    };
  }

  return {
    root: packageRoot,
    publicDir: false,
    plugins: [dts({ rollupTypes: true })],
    build: {
      lib: {
        entry: libEntry,
        formats: ['es'],
        fileName: () => 'activeframe.js',
      },
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      target: 'es2022',
    },
  };
});
