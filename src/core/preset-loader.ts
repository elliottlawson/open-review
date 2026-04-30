/**
 * Preset Loader
 *
 * Loads preset markdown files. Checks for local override first,
 * falls back to built-in defaults bundled with the package.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Paths
// ============================================================================

// Built-in presets live in the repo root's presets/ directory
const BUILTIN_PRESETS_DIR = resolve(__dirname, '../../presets');

const LOCAL_PRESETS_DIR = '.open-review/presets';

// ============================================================================
// Loader
// ============================================================================

/**
 * Load a single preset by name, checking local first then built-in.
 */
function loadPreset(
  name: string,
  cwd: string
): string | null {
  // Check local override
  const localPath = join(cwd, LOCAL_PRESETS_DIR, `${name}.md`);
  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  // Fall back to built-in
  const builtinPath = join(BUILTIN_PRESETS_DIR, `${name}.md`);
  if (existsSync(builtinPath)) {
    return readFileSync(builtinPath, 'utf-8');
  }

  return null;
}

/**
 * Load all specified presets.
 *
 * @param presetNames - Array of preset names to load
 * @param cwd - Working directory for resolving local presets
 * @returns Array of loaded preset content strings
 */
export function loadPresets(
  presetNames: string[],
  cwd: string = process.cwd()
): string[] {
  const loaded: string[] = [];

  for (const name of presetNames) {
    const content = loadPreset(name, cwd);
    if (content) {
      loaded.push(content);
    } else {
      console.warn(`Warning: Preset not found: ${name}`);
    }
  }

  return loaded;
}

/**
 * List all available built-in presets.
 */
export function listBuiltinPresets(): string[] {
  if (!existsSync(BUILTIN_PRESETS_DIR)) {
    return [];
  }

  return readdirSync(BUILTIN_PRESETS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}

/**
 * List all available local presets.
 */
export function listLocalPresets(cwd: string = process.cwd()): string[] {
  const localDir = join(cwd, LOCAL_PRESETS_DIR);
  if (!existsSync(localDir)) {
    return [];
  }

  return readdirSync(localDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}
