// Publishes the current build to GitHub Pages (https://sidxcodes.github.io/rustbound/).
// Builds dist/index.html, then commits it to the gh-pages branch (in a temporary clone) and pushes.
// Usage: npm run publish:pages
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
execFileSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
const remote = git(['remote', 'get-url', 'origin']);
const rev = git(['rev-parse', '--short', 'HEAD']);
const dir = mkdtempSync(join(tmpdir(), 'rustbound-pages-'));
try {
  git(['clone', '--quiet', '--depth', '1', '--branch', 'gh-pages', remote, dir]);
  copyFileSync('dist/index.html', join(dir, 'index.html'));
  writeFileSync(join(dir, '.nojekyll'), '');
  git(['add', '-A'], dir);
  if (!git(['status', '--porcelain'], dir)) { console.log('gh-pages already has this build; nothing to publish'); process.exit(0); }
  git(['commit', '--quiet', '-m', `Publish Rustbound build from main @ ${rev}`], dir);
  git(['push', '--quiet', 'origin', 'gh-pages'], dir);
  console.log(`published main @ ${rev} to gh-pages; live in a minute at https://sidxcodes.github.io/rustbound/`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
