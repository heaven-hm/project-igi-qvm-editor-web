// Vercel Build Output API v3: https://vercel.com/docs/build-output-api
// Generate deployment artifacts from the static build, never from the repository.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const dist = new URL('../web/dist/', import.meta.url);
await readFile(new URL('index.html', dist));
await readFile(new URL('wasm/qvm.wasm', dist));
const output = new URL('../.vercel/output/', import.meta.url);
await mkdir(output, { recursive: true });
await rm(new URL('static/', output), { recursive: true, force: true });
await cp(dist, new URL('static/', output), { recursive: true });
await writeFile(new URL('config.json', output), JSON.stringify({
  version: 3,
  routes: [
    { src: '/(.*)', headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY'
    }, continue: true },
    { handle: 'filesystem' }
  ]
}, null, 2) + '\n');
console.log('Prepared .vercel/output with the compiled static application.');
