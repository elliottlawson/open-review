/**
 * Framework Detector
 *
 * Scans project files to detect frameworks and return relevant preset names.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Detection Rules
// ============================================================================

interface DetectionRule {
  name: string;
  preset: string;
  detect: (dir: string) => boolean;
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(join(dir, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hasDependency(pkg: Record<string, unknown> | null, name: string): boolean {
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, unknown> | undefined;
  const devDeps = pkg.devDependencies as Record<string, unknown> | undefined;
  return !!(deps?.[name] || devDeps?.[name]);
}

const DETECTION_RULES: DetectionRule[] = [
  {
    name: 'Laravel',
    preset: 'laravel',
    detect: (dir) => {
      return existsSync(join(dir, 'artisan')) && existsSync(join(dir, 'composer.json'));
    },
  },
  {
    name: 'Next.js',
    preset: 'nextjs',
    detect: (dir) => {
      if (existsSync(join(dir, 'next.config.js')) ||
          existsSync(join(dir, 'next.config.ts')) ||
          existsSync(join(dir, 'next.config.mjs'))) {
        return true;
      }
      const pkg = readPackageJson(dir);
      return hasDependency(pkg, 'next');
    },
  },
  {
    name: 'React',
    preset: 'react',
    detect: (dir) => {
      const pkg = readPackageJson(dir);
      return hasDependency(pkg, 'react');
    },
  },
  {
    name: 'Vue',
    preset: 'vue',
    detect: (dir) => {
      const pkg = readPackageJson(dir);
      return hasDependency(pkg, 'vue');
    },
  },
];

// ============================================================================
// Detector
// ============================================================================

export interface DetectedFramework {
  name: string;
  preset: string;
}

/**
 * Detect frameworks in the given directory.
 * Returns list of detected frameworks with their preset names.
 */
export function detectFrameworks(dir: string): DetectedFramework[] {
  const detected: DetectedFramework[] = [];

  for (const rule of DETECTION_RULES) {
    if (rule.detect(dir)) {
      detected.push({
        name: rule.name,
        preset: rule.preset,
      });
    }
  }

  return detected;
}

/**
 * Get preset names for auto-detected frameworks.
 * Returns empty array if no frameworks detected.
 */
export function getAutoPresets(dir: string): string[] {
  return detectFrameworks(dir).map(f => f.preset);
}
