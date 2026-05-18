import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = path.resolve(import.meta.dirname, '..');
const bundles = [
  {
    entryPoint: path.join(rootDir, 'webview', 'main.ts'),
    outputFile: path.join(rootDir, 'dist', 'webview.js')
  },
  {
    entryPoint: path.join(rootDir, 'webview', 'markdownPreview.ts'),
    outputFile: path.join(rootDir, 'dist', 'markdownPreview.js')
  }
];

for (const bundleConfig of bundles) {
  await mkdir(path.dirname(bundleConfig.outputFile), { recursive: true });

  await build({
    entryPoints: [bundleConfig.entryPoint],
    outfile: bundleConfig.outputFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    external: ['fs']
  });
}