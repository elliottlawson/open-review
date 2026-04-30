/**
 * Configuration Loader
 *
 * Loads and validates .open-review/config.yml from the current directory or repo
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, resolveConfig, DEFAULT_CONFIG, type ResolvedConfig } from './schema.js';

// ============================================================================
// Constants
// ============================================================================

const CONFIG_PATH = '.open-review/config.yml';

// ============================================================================
// Loader
// ============================================================================

export interface LoadConfigResult {
  config: ResolvedConfig;
  configPath: string | null;  // null if using defaults
  errors: string[];
}

/**
 * Load config from filesystem (for CLI usage)
 */
export function loadConfigFromFile(dir: string = process.cwd()): LoadConfigResult {
  const configPath = join(dir, CONFIG_PATH);

  if (!existsSync(configPath)) {
    return {
      config: DEFAULT_CONFIG,
      configPath: null,
      errors: [],
    };
  }

  const rawContent = readFileSync(configPath, 'utf-8');

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(rawContent);
  } catch (error) {
    return {
      config: DEFAULT_CONFIG,
      configPath,
      errors: [`Failed to parse ${configPath}: ${(error as Error).message}`],
    };
  }

  // Handle empty file
  if (parsed === null || parsed === undefined) {
    return {
      config: DEFAULT_CONFIG,
      configPath,
      errors: [],
    };
  }

  // Validate against schema
  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map(e =>
      `${e.path.join('.')}: ${e.message}`
    );
    return {
      config: DEFAULT_CONFIG,
      configPath,
      errors,
    };
  }

  return {
    config: resolveConfig(result.data),
    configPath,
    errors: [],
  };
}

/**
 * Load config from string content (for GitHub Action usage where we fetch the file)
 */
export function loadConfigFromString(content: string): LoadConfigResult {
  // Parse YAML
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    return {
      config: DEFAULT_CONFIG,
      configPath: null,
      errors: [`Failed to parse config: ${(error as Error).message}`],
    };
  }

  // Handle empty content
  if (parsed === null || parsed === undefined) {
    return {
      config: DEFAULT_CONFIG,
      configPath: null,
      errors: [],
    };
  }

  // Validate against schema
  const result = ConfigSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map(e =>
      `${e.path.join('.')}: ${e.message}`
    );
    return {
      config: DEFAULT_CONFIG,
      configPath: null,
      errors,
    };
  }

  return {
    config: resolveConfig(result.data),
    configPath: null,
    errors: [],
  };
}

// Re-export types
export { type ResolvedConfig, type OpenReviewConfig } from './schema.js';
