/**
 * Publish Command
 *
 * Copies built-in methodology files to .open-review/methodology/
 * for local customization (like Laravel's vendor:publish).
 */

import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILTIN_METHODOLOGY_DIR = resolve(__dirname, '../../methodology');

const METHODOLOGY_FILES = [
  'core.md',
  'output-discipline.md',
  'communication-style.md',
];

export function runPublish(cwd: string = process.cwd()): void {
  const targetDir = join(cwd, '.open-review', 'methodology');

  // Create target directory
  mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  let skipped = 0;

  for (const file of METHODOLOGY_FILES) {
    const source = join(BUILTIN_METHODOLOGY_DIR, file);
    const target = join(targetDir, file);

    if (!existsSync(source)) {
      console.error(`  ⚠ Built-in methodology file not found: ${file}`);
      continue;
    }

    if (existsSync(target)) {
      console.log(`  ⏭  Already exists: .open-review/methodology/${file}`);
      skipped++;
      continue;
    }

    copyFileSync(source, target);
    console.log(`  ✓  Copied: .open-review/methodology/${file}`);
    copied++;
  }

  console.log('');
  if (copied > 0) {
    console.log(`Published ${copied} methodology file(s) to .open-review/methodology/`);
    console.log('These files are now yours — edit them to customize your review process.');
  }
  if (skipped > 0) {
    console.log(`Skipped ${skipped} file(s) that already exist.`);
    console.log('To update, delete the existing files and run publish again.');
  }
}
