import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerPath = new URL('../dist/sw.js', import.meta.url);
const distPath = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const buildId = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const buildMarker = '__COMPOS_BUILD_ID__';
const precacheMarker = "'__COMPOS_PRECACHE_ASSETS__'";
const worker = readFileSync(workerPath, 'utf8');

if (!worker.includes(buildMarker) || !worker.includes(precacheMarker)) {
  throw new Error('Could not stamp the exported service worker build id.');
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const runtimePrefixes = ['_expo/', '@powersync/', 'fonts/', 'assets/'];
const precacheAssets = listFiles(distPath)
  .map((path) => relative(distPath, path).split(sep).join('/'))
  .filter((path) =>
    path === 'index.html' ||
    path === 'manifest.webmanifest' ||
    path === 'favicon.ico' ||
    runtimePrefixes.some((prefix) => path.startsWith(prefix))
  )
  .map((path) => path === 'index.html' ? '/' : `/${path}`)
  .sort();

writeFileSync(
  workerPath,
  worker
    .replace(buildMarker, buildId)
    .replace(precacheMarker, precacheAssets.map((path) => JSON.stringify(path)).join(', '))
);
