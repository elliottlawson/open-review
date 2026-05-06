/**
 * Init Command
 *
 * Interactive wizard to set up Open Review in a repository.
 * Creates .open-review/config.yml and optionally generates skill files.
 *
 * Edit mode: if .open-review/config.yml exists, loads current values as defaults.
 */

import { createInterface } from 'readline';
import { existsSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfigFromFile } from '../config/loader.js';
import { DEFAULT_CONFIG, type ResolvedConfig } from '../config/schema.js';
import { installSkills } from './skills.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

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
  presets: string[];
  conventions: string;
  output: OutputSettings;
  generateSkills: boolean;
  generateAction: boolean;
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
// Framework Detection
// ============================================================================

interface DetectedFramework {
  name: string;
  preset: string;
  configFiles: string[];
}

const FRAMEWORK_DETECTIONS: DetectedFramework[] = [
  {
    name: 'Laravel',
    preset: 'laravel',
    configFiles: ['artisan', 'composer.json'],
  },
  {
    name: 'React',
    preset: 'react',
    configFiles: ['package.json'],
  },
  {
    name: 'Next.js',
    preset: 'nextjs',
    configFiles: ['next.config.js', 'next.config.ts', 'next.config.mjs'],
  },
  {
    name: 'Vue',
    preset: 'vue',
    configFiles: ['vue.config.js', 'vite.config.ts'],
  },
];

function detectFrameworks(dir: string): DetectedFramework[] {
  const detected: DetectedFramework[] = [];

  for (const fw of FRAMEWORK_DETECTIONS) {
    // For Laravel, require both artisan and composer.json
    if (fw.configFiles.length > 1) {
      if (fw.configFiles.every(f => existsSync(join(dir, f)))) {
        detected.push(fw);
      }
    } else {
      const configFile = fw.configFiles[0];
      if (existsSync(join(dir, configFile))) {
        // For React, check package.json for react dependency
        if (fw.preset === 'react') {
          try {
            const pkg = JSON.parse(require('fs').readFileSync(join(dir, 'package.json'), 'utf-8'));
            if (pkg.dependencies?.react || pkg.devDependencies?.react) {
              detected.push(fw);
            }
          } catch {
            // Skip if can't parse
          }
        } else {
          detected.push(fw);
        }
      }
    }
  }

  return detected;
}

// ============================================================================
// Model Presets
// ============================================================================

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
// Preset Distribution
// ============================================================================

const PRESETS_DIR = resolve(__dirname, '../../presets');

function distributePresets(cwd: string, presetNames: string[]): void {
  if (presetNames.length === 0) return;

  const targetDir = join(cwd, '.open-review', 'presets');
  mkdirSync(targetDir, { recursive: true });

  for (const name of presetNames) {
    const sourcePath = join(PRESETS_DIR, `${name}.md`);
    const targetPath = join(targetDir, `${name}.md`);

    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
      console.log(`  ✓  Copied preset: ${name}.md`);
    } else {
      console.log(`  ⚠  Preset not found: ${name}.md`);
    }
  }
}

// ============================================================================
// Config Generator
// ============================================================================

function generateConfig(options: WizardOptions): string {
  const lines: string[] = [
    '# Open Review Configuration',
    '# https://github.com/elliottlawson/open-review',
    '',
    'version: "1.0"',
    '',
    '# Review Settings',
    'review:',
    `  methodology: default`,
  ];

  if (options.presets.length > 0) {
    lines.push(`  presets: [${options.presets.join(', ')}]`);
  } else {
    lines.push(`  presets: auto`);
  }

  if (options.conventions && options.conventions !== 'auto') {
    // Check if it looks like inline text vs a file path
    if (options.conventions.includes('/') || options.conventions.endsWith('.md')) {
      lines.push(`  conventions: ${options.conventions}`);
    } else {
      lines.push(`  conventions: "${options.conventions}"`);
    }
  } else {
    lines.push(`  conventions: auto`);
  }

  // LLM section
  lines.push('', '# LLM Settings', 'llm:');
  lines.push(`  provider: ${options.provider}`);
  lines.push(`  model: ${options.model}`);

  // Output section (only if non-defaults)
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

  if (outputLines.length > 0) {
    lines.push('', 'output:');
    lines.push(...outputLines);
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Resolve Options from Config or Defaults
// ============================================================================

function buildOptionsFromConfig(config: ResolvedConfig): WizardOptions {
  const presets = config.review.presets === 'auto' ? [] : config.review.presets;
  const conventions = config.review.conventions === 'auto' ? '' : config.review.conventions;

  return {
    provider: config.llm.provider as Provider,
    model: config.llm.model,
    presets,
    conventions,
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
    generateSkills: false,
    generateAction: false,
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
  if (defaultIndex === -1) defaultIndex = choices.length - 1;

  const choice = await promptChoice(rl, 'Model:', choices, defaultIndex);

  if (choice < presets.length) {
    return presets[choice];
  }

  const defaultText = presets.includes(current) ? '' : current;
  const custom = await prompt(rl, `Model name${defaultText ? ` [${defaultText}]` : ''}: `);
  return custom || defaultText || getDefaultModel(provider);
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
  const configDir = join(cwd, '.open-review');
  mkdirSync(configDir, { recursive: true });

  console.log(`\n${isEdit ? '📝 Updating' : '📝 Creating'} .open-review/config.yml...\n`);
  const content = generateConfig(options);
  writeFileSync(join(configDir, 'config.yml'), content);
  console.log(`   ✓ ${isEdit ? 'Updated' : 'Created'} .open-review/config.yml`);
}

function printNextSteps(isEdit: boolean, skillsInstalled: boolean): void {
  console.log('\n' + '='.repeat(50));
  console.log(`${isEdit ? '✅ Updated' : '✅ Created'}!\n`);

  if (skillsInstalled) {
    console.log('Agent review:');
    console.log('   Invoke /review in your configured agent, or ask the agent to review the current changes.');
    console.log('');
  }

  console.log('Standalone CLI review:');
  if (!process.env.OPEN_REVIEW_API_KEY) {
    console.log('   Set your API key:');
    console.log('   export OPEN_REVIEW_API_KEY=your_key_here');
    console.log('');
  }
  console.log('   open-review review --diff main');
  console.log('');
}

// ============================================================================
// Quick Mode
// ============================================================================

async function runQuickInit(cwd: string, flags: InitFlags, isEdit: boolean): Promise<void> {
  console.log(`\n🔧 Open Review ${isEdit ? 'Update' : 'Setup'} (quick)\n`);

  const { config } = loadConfigFromFile(cwd);
  const options = buildOptionsFromConfig(config);

  if (flags.provider) {
    const providerChanged = flags.provider !== options.provider;
    options.provider = flags.provider;
    if (providerChanged && !flags.model) {
      options.model = getDefaultModel(flags.provider);
    }
  }
  if (flags.model) options.model = flags.model;

  // Auto-detect presets
  const detected = detectFrameworks(cwd);
  if (detected.length > 0) {
    options.presets = detected.map(f => f.preset);
    console.log(`Detected: ${detected.map(f => f.name).join(', ')}`);
  }

  writeConfig(cwd, options, isEdit);
  await installSkills(cwd, { force: flags.force, interactive: false });
  printNextSteps(isEdit, true);
}

// ============================================================================
// Main Init Function
// ============================================================================

export async function runInit(cwd: string = process.cwd(), flags: InitFlags = { quick: false, force: false }): Promise<void> {
  const configPath = join(cwd, '.open-review', 'config.yml');
  const configExists = existsSync(configPath);
  const isEdit = configExists;

  if (flags.quick) {
    return runQuickInit(cwd, flags, isEdit);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Load existing config or defaults
  const { config: fileConfig } = loadConfigFromFile(cwd);
  const options = buildOptionsFromConfig(fileConfig);

  console.log('\n🔧 Open Review Setup\n');

  if (isEdit) {
    console.log('Found existing .open-review/config.yml');
    console.log('Press Enter to keep current values, or type new ones.\n');
  } else {
    console.log('This wizard creates .open-review/config.yml in your project root.\n');
  }

  // Step 1: Framework detection
  const detectedFrameworks = detectFrameworks(cwd);
  if (detectedFrameworks.length > 0) {
    console.log(`📁 Detected: ${detectedFrameworks.map(f => f.name).join(', ')}`);
    const applyPresets = await promptYesNo(rl, `Apply detected presets?`, true);
    if (applyPresets) {
      options.presets = detectedFrameworks.map(f => f.preset);
    }
  }

  // Step 2: Provider
  options.provider = await promptProvider(rl, options.provider);

  // Step 3: Model
  options.model = await promptModel(rl, options.provider, options.model);

  // Step 4: Generate config file
  const generateConfigFile = await promptYesNo(rl, 'Generate config file?', true);

  // Step 5: Install agent skills
  options.generateSkills = await promptYesNo(rl, 'Install agent skills?', true);

  // Step 6: Install GitHub Action
  options.generateAction = await promptYesNo(rl, 'Install GitHub Action?', true);

  // Step 7: Timezone
  options.output.timezone = await promptTimezone(rl, options.output.timezone);

  rl.close();

  // Write files
  if (generateConfigFile) {
    writeConfig(cwd, options, isEdit);
  }

  // Copy presets if any were selected
  if (options.presets.length > 0) {
    console.log('\n📦 Presets\n');
    distributePresets(cwd, options.presets);
  }

  // Generate skill files
  if (options.generateSkills) {
    await installSkills(cwd, { force: flags.force });
  }

  // Generate GitHub Action workflow
  if (options.generateAction) {
    const workflowDir = join(cwd, '.github', 'workflows');
    const workflowPath = join(workflowDir, 'open-review.yml');
    const templatePath = resolve(__dirname, '../../templates/workflow.yml');

    if (existsSync(templatePath)) {
      mkdirSync(workflowDir, { recursive: true });
      if (!existsSync(workflowPath) || flags.force) {
        copyFileSync(templatePath, workflowPath);
        console.log(`\n  ✓  Created: .github/workflows/open-review.yml`);
      } else {
        console.log(`\n  ⏭  Already exists: .github/workflows/open-review.yml`);
      }
    }
  }

  printNextSteps(isEdit, options.generateSkills);
}
