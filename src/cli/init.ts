/**
 * Init Command
 *
 * Interactive wizard to set up Open Review in a repository.
 * Creates .open-review.yml with minimal, non-default settings only.
 *
 * Edit mode: if .open-review.yml exists, loads current values as defaults.
 */

import { createInterface } from 'readline';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfigFromFile } from '../config/loader.js';
import { DEFAULT_CONFIG, type ResolvedConfig } from '../config/schema.js';

// ============================================================================
// Types
// ============================================================================

type ProjectType = 'laravel' | 'node' | 'python' | 'ruby' | 'go' | 'generic';
type Provider = 'anthropic' | 'openai' | 'openrouter';
type CollapseMode = 'auto' | 'always' | 'never';

interface SectionSettings {
  enabled: boolean;
  collapse: CollapseMode;
}

interface OutputSettings {
  format: 'human' | 'json';
  colors: 'auto' | 'true' | 'false';
  timezone: string;
  path?: string;
  sections: {
    must_fix: SectionSettings;
    should_fix: SectionSettings;
    suggestions: SectionSettings;
    questions: SectionSettings;
  };
  verdicts: {
    approve: { label: string };
    changes_needed: { label: string };
    hold: { label: string };
  };
}

interface WizardOptions {
  provider: Provider;
  model: string;
  instructionsFile: string;
  flagEmptyDescription: boolean;
  skipIfOnly: string[];
  ignorePatterns: string[];
  output: OutputSettings;
}

interface InitFlags {
  quick: boolean;
  provider?: Provider;
  model?: string;
  force: boolean;
}

export function parseInitArgs(args: string[]): InitFlags {
  const flags: InitFlags = { quick: false, force: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--quick' || arg === '-y' || arg === '--yes') {
      flags.quick = true;
    } else if (arg === '--force' || arg === '-f') {
      flags.force = true;
    } else if (arg === '--provider' || arg === '-p') {
      const p = args[++i] as Provider;
      if (['anthropic', 'openai', 'openrouter'].includes(p)) flags.provider = p;
    } else if (arg === '--model' || arg === '-m') {
      flags.model = args[++i];
    }
  }

  return flags;
}

// ============================================================================
// Project Detection
// ============================================================================

const PROJECT_TYPES: Record<ProjectType, { name: string; ignores: string[] }> = {
  laravel: {
    name: 'Laravel/PHP',
    ignores: ['vendor/**', 'node_modules/**', '*.lock', 'storage/**', 'bootstrap/cache/**', 'public/build/**'],
  },
  node: {
    name: 'Node.js',
    ignores: ['node_modules/**', 'dist/**', 'build/**', '*.lock', '.next/**', 'coverage/**'],
  },
  python: {
    name: 'Python',
    ignores: ['venv/**', '.venv/**', '__pycache__/**', '*.egg-info/**', '.tox/**', 'dist/**', 'build/**'],
  },
  ruby: {
    name: 'Ruby',
    ignores: ['vendor/bundle/**', '*.lock', 'tmp/**', 'log/**'],
  },
  go: {
    name: 'Go',
    ignores: ['vendor/**', 'bin/**'],
  },
  generic: {
    name: 'Generic',
    ignores: ['*.lock', '*.min.js', '*.min.css', 'dist/**', 'build/**'],
  },
};

function detectProjectType(dir: string): ProjectType {
  if (existsSync(join(dir, 'artisan')) && existsSync(join(dir, 'composer.json'))) return 'laravel';
  if (existsSync(join(dir, 'package.json'))) return 'node';
  if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'setup.py'))) return 'python';
  if (existsSync(join(dir, 'Gemfile'))) return 'ruby';
  if (existsSync(join(dir, 'go.mod'))) return 'go';
  return 'generic';
}

// ============================================================================
// Model Presets
// ============================================================================

// TODO: Consider fetching from models.dev to avoid maintaining this list manually.
const PROVIDER_PRESETS: Record<Provider, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  openrouter: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
};

function getDefaultModel(provider: Provider): string {
  return PROVIDER_PRESETS[provider][0];
}

// ============================================================================
// Timezone Detection
// ============================================================================

function detectSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York';
  }
}

// ============================================================================
// Prompt Helpers
// ============================================================================

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function promptChoice(
  rl: ReturnType<typeof createInterface>,
  question: string,
  choices: string[],
  defaultChoice: number = 0
): Promise<number> {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    const marker = i === defaultChoice ? '>' : ' ';
    console.log(`  ${marker} ${i + 1}. ${choice}`);
  });

  const answer = await prompt(rl, `Choice [${defaultChoice + 1}]: `);
  if (!answer) return defaultChoice;

  const num = parseInt(answer, 10);
  if (num >= 1 && num <= choices.length) return num - 1;
  return defaultChoice;
}

async function promptYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: boolean = true
): Promise<boolean> {
  const hint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await prompt(rl, `${question} ${hint}: `);
  if (!answer) return defaultValue;
  return answer.toLowerCase().startsWith('y');
}

async function promptWithDefault(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: string
): Promise<string> {
  const answer = await prompt(rl, `${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

// ============================================================================
// Instructions File Detection
// ============================================================================

function detectInstructionsFile(dir: string): string | null {
  const candidates = ['CONVENTIONS.md', 'CLAUDE.md', '.github/CONVENTIONS.md', 'docs/conventions.md', 'docs/CONVENTIONS.md'];
  for (const file of candidates) {
    if (existsSync(join(dir, file))) return file;
  }
  return null;
}

// ============================================================================
// Config Builder: Minimal Output (only non-defaults)
// ============================================================================

function isDifferent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function generateMinimalConfig(options: WizardOptions): string {
  const lines: string[] = [
    '# Open Review Configuration',
    '# https://github.com/elliottlawson/open-review',
    '',
    'llm:',
    `  provider: ${options.provider}`,
    `  model: ${options.model}`,
  ];

  // review section
  const reviewLines: string[] = [];
  if (options.instructionsFile) {
    reviewLines.push(`  instructions_file: ${options.instructionsFile}`);
  }
  if (options.flagEmptyDescription !== DEFAULT_CONFIG.review.flag_empty_description) {
    reviewLines.push(`  flag_empty_description: ${options.flagEmptyDescription}`);
  }
  if (options.skipIfOnly.length > 0) {
    reviewLines.push('  skip_if_only:');
    for (const p of options.skipIfOnly) reviewLines.push(`    - "${p}"`);
  }

  if (reviewLines.length > 0) {
    lines.push('', 'review:');
    lines.push(...reviewLines);
  }

  // output section — only include what's non-default
  const defaultOutput = DEFAULT_CONFIG.output;
  const out = options.output;
  const outputLines: string[] = [];

  if (out.format !== defaultOutput.format) {
    outputLines.push(`  format: ${out.format}`);
  }
  if (out.colors !== defaultOutput.colors) {
    outputLines.push(`  colors: ${out.colors}`);
  }
  if (out.timezone !== defaultOutput.timezone) {
    outputLines.push(`  timezone: ${out.timezone}`);
  }
  if (out.path) {
    outputLines.push(`  path: ${out.path}`);
  }

  // sections
  const sectionKeys = ['must_fix', 'should_fix', 'suggestions', 'questions'] as const;
  const sectionLines: string[] = [];
  for (const key of sectionKeys) {
    const sec = out.sections[key];
    const defSec = defaultOutput.sections[key];
    if (sec.enabled !== defSec.enabled || sec.collapse !== defSec.collapse) {
      sectionLines.push(`    ${key}:`);
      if (sec.enabled !== defSec.enabled) sectionLines.push(`      enabled: ${sec.enabled}`);
      if (sec.collapse !== defSec.collapse) sectionLines.push(`      collapse: ${sec.collapse}`);
    }
  }
  if (sectionLines.length > 0) {
    outputLines.push('  sections:');
    outputLines.push(...sectionLines);
  }

  // verdicts
  const verdictKeys = ['approve', 'changes_needed', 'hold'] as const;
  const verdictLines: string[] = [];
  for (const key of verdictKeys) {
    if (out.verdicts[key].label !== defaultOutput.verdicts[key].label) {
      verdictLines.push(`    ${key}:`);
      verdictLines.push(`      label: "${out.verdicts[key].label}"`);
    }
  }
  if (verdictLines.length > 0) {
    outputLines.push('  verdicts:');
    outputLines.push(...verdictLines);
  }

  if (outputLines.length > 0) {
    lines.push('', 'output:');
    lines.push(...outputLines);
  }

  // ignore
  if (options.ignorePatterns.length > 0) {
    lines.push('', 'ignore:');
    for (const pattern of options.ignorePatterns) {
      lines.push(`  - "${pattern}"`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Resolve Options from Config or Defaults
// ============================================================================

function buildOptionsFromConfig(config: ResolvedConfig, cwd: string): WizardOptions {
  const detectedType = detectProjectType(cwd);
  const detectedInstructions = detectInstructionsFile(cwd);

  return {
    provider: config.llm.provider as Provider,
    model: config.llm.model,
    instructionsFile: config.review.instructions_file ?? detectedInstructions ?? 'CONVENTIONS.md',
    flagEmptyDescription: config.review.flag_empty_description,
    skipIfOnly: config.review.skip_if_only ?? [],
    ignorePatterns: config.ignore.length > 0 ? [...config.ignore] : [...PROJECT_TYPES[detectedType].ignores],
    output: {
      format: config.output.format,
      colors: config.output.colors,
      timezone: config.output.timezone,
      path: config.output.path,
      sections: {
        must_fix: { ...config.output.sections.must_fix },
        should_fix: { ...config.output.sections.should_fix },
        suggestions: { ...config.output.sections.suggestions },
        questions: { ...config.output.sections.questions },
      },
      verdicts: {
        approve: { ...config.output.verdicts.approve },
        changes_needed: { ...config.output.verdicts.changes_needed },
        hold: { ...config.output.verdicts.hold },
      },
    },
  };
}

// ============================================================================
// Interactive Wizard Steps
// ============================================================================

async function promptProvider(rl: ReturnType<typeof createInterface>, current: Provider): Promise<Provider> {
  const providers: Provider[] = ['anthropic', 'openai', 'openrouter'];
  const defaultIndex = providers.indexOf(current);
  const choices = providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const choice = await promptChoice(rl, 'LLM provider:', choices, Math.max(0, defaultIndex));
  return providers[choice];
}

async function promptModel(rl: ReturnType<typeof createInterface>, provider: Provider, current: string): Promise<string> {
  const presets = PROVIDER_PRESETS[provider];
  const choices = [...presets, 'Other (custom)'];

  let defaultIndex = presets.indexOf(current);
  if (defaultIndex === -1) defaultIndex = choices.length - 1; // "Other"

  const choice = await promptChoice(rl, 'Model:', choices, defaultIndex);

  if (choice < presets.length) {
    return presets[choice];
  }

  // Other — pre-fill with current model if it's not a preset
  const defaultText = presets.includes(current) ? '' : current;
  const custom = await prompt(rl, `Model name${defaultText ? ` [${defaultText}]` : ''}: `);
  return custom || defaultText || getDefaultModel(provider);
}

async function promptInstructionsFile(rl: ReturnType<typeof createInterface>, current: string, cwd: string): Promise<string> {
  const value = await promptWithDefault(rl, 'Instructions file', current);
  if (!value) return '';
  return value;
}

async function promptIgnorePatterns(
  rl: ReturnType<typeof createInterface>,
  detectedType: ProjectType,
  current: string[]
): Promise<string[]> {
  const typeInfo = PROJECT_TYPES[detectedType];

  console.log(`\nDetected ${typeInfo.name} project. Standard ignore patterns:`);
  for (const pattern of typeInfo.ignores) {
    console.log(`  - ${pattern}`);
  }

  const useStandard = await promptYesNo(rl, `Use these ignore patterns?`, true);
  let patterns = useStandard ? [...typeInfo.ignores] : [];

  const addExtra = await promptYesNo(rl, 'Add additional ignore patterns?', false);
  if (addExtra) {
    const extra = await prompt(rl, 'Patterns (comma-separated): ');
    if (extra) {
      const extras = extra.split(',').map((p) => p.trim()).filter(Boolean);
      patterns = [...patterns, ...extras];
    }
  }

  return patterns;
}

async function promptTimezone(rl: ReturnType<typeof createInterface>, current: string): Promise<string> {
  const detected = detectSystemTimezone();
  if (detected === current) {
    const correct = await promptYesNo(rl, `\nTimezone: ${detected}. Correct?`, true);
    return correct ? current : promptWithDefault(rl, 'Timezone', 'America/New_York');
  }
  return promptWithDefault(rl, 'Timezone', current);
}

// ============================================================================
// File Writing
// ============================================================================

function writeConfig(cwd: string, options: WizardOptions, isEdit: boolean): void {
  console.log(`\n${isEdit ? '📝 Updating' : '📝 Creating'} .open-review.yml...\n`);
  const content = generateMinimalConfig(options);
  writeFileSync(join(cwd, '.open-review.yml'), content);
  console.log(`   ✓ ${isEdit ? 'Updated' : 'Created'} .open-review.yml`);
}

function printNextSteps(options: WizardOptions, isEdit: boolean): void {
  console.log('\n' + '='.repeat(50));
  console.log(`${isEdit ? '✅ Updated' : '✅ Created'}!\n`);

  if (!process.env.OPEN_REVIEW_API_KEY) {
    console.log('Next steps:\n');
    console.log('1. Set your API key:');
    console.log('   export OPEN_REVIEW_API_KEY=your_key_here');
    console.log('');
  }

  if (options.instructionsFile && !existsSync(options.instructionsFile)) {
    console.log(`Tip: Create ${options.instructionsFile} to add custom review instructions.`);
    console.log('');
  }

  console.log('Run a review:');
  console.log('   open-review review --diff main');
  console.log('');
}

// ============================================================================
// Quick Mode
// ============================================================================

async function runQuickInit(cwd: string, flags: InitFlags, isEdit: boolean): Promise<void> {
  console.log(`\n🔧 Open Review ${isEdit ? 'Update' : 'Setup'} (quick)\n`);

  const { config } = loadConfigFromFile(cwd);
  const options = buildOptionsFromConfig(config, cwd);

  if (flags.provider) {
    const providerChanged = flags.provider !== options.provider;
    options.provider = flags.provider;
    // If provider changed and no explicit model given, reset to provider default
    if (providerChanged && !flags.model) {
      options.model = getDefaultModel(flags.provider);
    }
  }
  if (flags.model) options.model = flags.model;

  writeConfig(cwd, options, isEdit);
  printNextSteps(options, isEdit);
}

// ============================================================================
// Main Init Function
// ============================================================================

export async function runInit(cwd: string = process.cwd(), flags: InitFlags = { quick: false, force: false }): Promise<void> {
  const configPath = join(cwd, '.open-review.yml');
  const configExists = existsSync(configPath);
  const isEdit = configExists;

  if (flags.quick) {
    return runQuickInit(cwd, flags, isEdit);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Load existing config or defaults
  const { config: fileConfig } = loadConfigFromFile(cwd);
  const options = buildOptionsFromConfig(fileConfig, cwd);

  console.log('\n🔧 Open Review Setup\n');

  if (isEdit) {
    console.log('Found existing .open-review.yml');
    console.log('Press Enter to keep current values, or type new ones.\n');
  } else {
    console.log('This wizard creates .open-review.yml in your project root.\n');
  }

  // Step 1: Project detection
  const detectedType = detectProjectType(cwd);
  console.log(`📁 Detected: ${PROJECT_TYPES[detectedType].name} project\n`);

  // Step 2: Provider
  options.provider = await promptProvider(rl, options.provider);

  // Step 3: Model
  options.model = await promptModel(rl, options.provider, options.model);

  // Step 4: Instructions file
  options.instructionsFile = await promptInstructionsFile(rl, options.instructionsFile, cwd);

  // Step 5: Ignore patterns
  options.ignorePatterns = await promptIgnorePatterns(rl, detectedType, options.ignorePatterns);

  // Step 6: Timezone
  options.output.timezone = await promptTimezone(rl, options.output.timezone);

  rl.close();

  writeConfig(cwd, options, isEdit);
  printNextSteps(options, isEdit);
}
