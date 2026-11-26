import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const bundles = [
  { entry: 'tests/core.test.ts', out: '.tmp-core-test.mjs' },
  { entry: 'tests/ui.test.tsx', out: '.tmp-ui-test.mjs' },
];

let failed = false;

try {
  for (const item of bundles) {
    await build({
      entryPoints: [item.entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outfile: item.out,
    });
  }

  const res = spawnSync(process.execPath, ['--test', ...bundles.map((b) => b.out)], {
    stdio: 'inherit',
  });
  if (res.status !== 0) failed = true;
} finally {
  for (const item of bundles) {
    rmSync(item.out, { force: true });
  }
}

if (failed) process.exit(1);
