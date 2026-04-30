/**
 * Methodology Loader
 *
 * Loads methodology markdown files. Checks for local override first,
 * falls back to built-in defaults bundled with the package.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Paths
// ============================================================================

// Built-in methodology lives in the repo root's methodology/ directory
const BUILTIN_METHODOLOGY_DIR = resolve(__dirname, '../../methodology');

const LOCAL_METHODOLOGY_DIR = '.open-review/methodology';

const METHODOLOGY_FILES = {
  core: 'core.md',
  outputDiscipline: 'output-discipline.md',
  communicationStyle: 'communication-style.md',
} as const;

// ============================================================================
// Loader
// ============================================================================

export interface MethodologyContent {
  core: string;
  outputDiscipline: string;
  communicationStyle: string;
}

/**
 * Load a single methodology file, checking local first then built-in.
 */
function loadMethodologyFile(
  filename: string,
  basePath: string,
  localDir: string | null
): string {
  // Check local override
  if (localDir) {
    const localPath = join(localDir, filename);
    if (existsSync(localPath)) {
      return readFileSync(localPath, 'utf-8');
    }
  }

  // Fall back to built-in
  const builtinPath = join(basePath, filename);
  if (existsSync(builtinPath)) {
    return readFileSync(builtinPath, 'utf-8');
  }

  throw new Error(`Methodology file not found: ${filename}`);
}

/**
 * Load all methodology files.
 *
 * @param cwd - Working directory for resolving local methodology
 * @param customPath - Custom methodology path from config (e.g. "./custom/review.md")
 */
export function loadMethodology(
  cwd: string = process.cwd(),
  customPath?: string
): MethodologyContent {
  const localDir = customPath
    ? resolve(cwd, customPath)
    : join(cwd, LOCAL_METHODOLOGY_DIR);

  // If custom path points to a single file, use it as core and still load
  // output-discipline and communication-style from local or built-in
  if (customPath && existsSync(resolve(cwd, customPath)) && !existsSync(localDir)) {
    const customCore = readFileSync(resolve(cwd, customPath), 'utf-8');
    return {
      core: customCore,
      outputDiscipline: loadMethodologyFile(
        METHODOLOGY_FILES.outputDiscipline,
        BUILTIN_METHODOLOGY_DIR,
        join(cwd, LOCAL_METHODOLOGY_DIR)
      ),
      communicationStyle: loadMethodologyFile(
        METHODOLOGY_FILES.communicationStyle,
        BUILTIN_METHODOLOGY_DIR,
        join(cwd, LOCAL_METHODOLOGY_DIR)
      ),
    };
  }

  return {
    core: loadMethodologyFile(
      METHODOLOGY_FILES.core,
      BUILTIN_METHODOLOGY_DIR,
      localDir
    ),
    outputDiscipline: loadMethodologyFile(
      METHODOLOGY_FILES.outputDiscipline,
      BUILTIN_METHODOLOGY_DIR,
      localDir
    ),
    communicationStyle: loadMethodologyFile(
      METHODOLOGY_FILES.communicationStyle,
      BUILTIN_METHODOLOGY_DIR,
      localDir
    ),
  };
}
