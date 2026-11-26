
import { cp, access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const source = path.join(
  root,
  'node_modules',
  'phonon-webgpu',
  'dist'
);

const target = path.join(
  root,
  'public',
  'vendor',
  'phonon'
);

try {
  await access(path.join(source, 'phonon.js'));
} catch {
  console.error(
    'Could not find phonon-webgpu/dist/phonon.js. Run npm install before building.'
  );
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

console.log(
  'Copied the complete Phonon distribution to public/vendor/phonon.'
);
