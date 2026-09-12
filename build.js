import { execSync } from 'node:child_process';

const extraArgs = process.argv.slice(2).join(' ');
console.log(`[build] Building client with vite ${extraArgs}...`);
execSync(`npx vite build ${extraArgs}`.trim(), { stdio: 'inherit' });

console.log('[build] Bundling server with esbuild...');
execSync(
  'npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs',
  { stdio: 'inherit' }
);
console.log('[build] Build completed successfully.');
