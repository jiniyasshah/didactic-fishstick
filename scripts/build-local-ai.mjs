import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function buildLocalAI() {
  await build({
    absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
    entryPoints: ['workers/local-ai.worker.ts'],
    outdir: 'public/ai-runtime', bundle: true, splitting: true,
    platform: 'browser', format: 'esm', target: 'es2022', minify: true,
    chunkNames: '[name]-[hash]', legalComments: 'linked',
  });
}
