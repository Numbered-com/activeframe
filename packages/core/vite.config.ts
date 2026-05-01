import { defineConfig, type Plugin, type UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

const packageRoot = __dirname;
const repoRoot = resolve(packageRoot, '../..');
const libEntry = resolve(packageRoot, 'src/index.ts');

// Rewrites `./ActiveFrame.js` (referenced from index.html) to the TS source so
// the same HTML works for `vite` (dev), the demo build, and the published
// dist/ (where the file actually lives next to the HTML).
function sourceAlias(): Plugin {
  return {
    name: 'activeframe-source-alias',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './ActiveFrame.js' && importer && importer.includes('index.html')) {
        return libEntry;
      }
      return null;
    },
  };
}

export default defineConfig(({ command, mode }): UserConfig => {
  if (command === 'serve') {
    return {
      root: packageRoot,
      publicDir: resolve(repoRoot, 'public'),
      server: { fs: { allow: [repoRoot] } },
      plugins: [sourceAlias()],
    };
  }

  // Static demo app build (Vercel target). Bundles index.html + src/ into
  // a deployable folder, with /public assets copied in.
  if (mode === 'demo') {
    return {
      root: packageRoot,
      publicDir: resolve(repoRoot, 'public'),
      plugins: [sourceAlias()],
      build: {
        outDir: resolve(packageRoot, 'demo-dist'),
        emptyOutDir: true,
        sourcemap: true,
        target: 'es2022',
      },
    };
  }

  // Library build (npm publish target).
  return {
    root: packageRoot,
    publicDir: false,
    plugins: [dts({ bundleTypes: true })],
    build: {
      lib: {
        entry: libEntry,
        formats: ['es'],
        fileName: () => 'activeframe.js',
      },
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2022',
    },
  };
});
