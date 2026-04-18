/**
 * Init Command
 * 
 * Interactive wizard to set up Open Review in a repository:
 * 1. Detects project type
 * 2. Creates .open-review.yml config with appropriate ignores
 * 3. Creates .github/workflows/open-review.yml
 * 4. Reminds user to set up secrets
 */

import { createInterface } from 'readline';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

type ProjectType = 'laravel' | 'node' | 'python' | 'ruby' | 'go' | 'generic';

interface InitOptions {
  provider: 'anthropic' | 'openai';
  model: string;
  projectType: ProjectType;
  instructionsFile?: string;
  ignorePatterns: string[];
  useLinear: boolean;
}

interface InitFlags {
  quick: boolean;      // Skip prompts, use defaults
  provider?: 'anthropic' | 'openai';
  model?: string;
  force: boolean;      // Overwrite existing files without asking
}

export function parseInitArgs(args: string[]): InitFlags {
  const flags: InitFlags = {
    quick: false,
    force: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--quick' || arg === '-y' || arg === '--yes') {
      flags.quick = true;
    } else if (arg === '--force' || arg === '-f') {
      flags.force = true;
    } else if (arg === '--provider' || arg === '-p') {
      flags.provider = args[++i] as 'anthropic' | 'openai';
    } else if (arg === '--model' || arg === '-m') {
      flags.model = args[++i];
    }
  }
  
  return flags;
}

// ============================================================================
// Project Detection
// ============================================================================

interface ProjectTypeInfo {
  name: string;
  ignores: string[];
}

const PROJECT_TYPES: Record<ProjectType, ProjectTypeInfo> = {
  laravel: {
    name: 'Laravel/PHP',
    ignores: ['vendor/**', 'node_modules/**', '*.lock', 'storage/**', 'bootstrap/cache/**', 'public/build/**'],
  },
  node: {
    name: 'Node.js/JavaScript',
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
  // Laravel (check for artisan AND composer.json)
  if (existsSync(join(dir, 'artisan')) && existsSync(join(dir, 'composer.json'))) {
    return 'laravel';
  }
  
  // Node.js
  if (existsSync(join(dir, 'package.json'))) {
    return 'node';
  }
  
  // Python
  if (existsSync(join(dir, 'requirements.txt')) || 
      existsSync(join(dir, 'pyproject.toml')) ||
      existsSync(join(dir, 'setup.py'))) {
    return 'python';
  }
  
  // Ruby
  if (existsSync(join(dir, 'Gemfile'))) {
    return 'ruby';
  }
  
  // Go
  if (existsSync(join(dir, 'go.mod'))) {
    return 'go';
  }
  
  return 'generic';
}

// ============================================================================
// Helper Functions
// ============================================================================

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
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
  if (num >= 1 && num <= choices.length) {
    return num - 1;
  }
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

function detectInstructionsFile(dir: string): string | null {
  const candidates = [
    'CONVENTIONS.md',
    'CLAUDE.md',
    '.github/CONVENTIONS.md',
    'docs/conventions.md',
    'docs/CONVENTIONS.md',
  ];
  
  for (const file of candidates) {
    if (existsSync(join(dir, file))) {
      return file;
    }
  }
  return null;
}

// ============================================================================
// Config Generation
// ============================================================================

function generateConfig(options: InitOptions): string {
  const lines: string[] = [
    '# Open Review Configuration',
    '# https://github.com/elliottlawson/open-review',
    '',
    '# LLM Settings',
    'llm:',
    `  provider: ${options.provider}`,
    `  model: ${options.model}`,
    '',
    '# Review Behavior',
    'review:',
  ];
  
  // Instructions file
  if (options.instructionsFile) {
    lines.push(`  instructions_file: ${options.instructionsFile}`);
  }
  
  // Inline instructions (commented example)
  lines.push('  # instructions: |');
  lines.push('  #   - Add any additional review instructions here');
  lines.push('  flag_empty_description: true');
  
  // Linear
  if (options.useLinear) {
    lines.push('');
    lines.push('# Linear Integration');
    lines.push('linear:');
    lines.push('  enabled: true');
  }
  
  // Ignore patterns
  if (options.ignorePatterns.length > 0) {
    lines.push('');
    lines.push('# Files to skip');
    lines.push('ignore:');
    for (const pattern of options.ignorePatterns) {
      lines.push(`  - "${pattern}"`);
    }
  }
  
  lines.push('');
  return lines.join('\n');
}

function generateWorkflow(options: InitOptions): string {
  const apiKeySecret = options.provider === 'anthropic' 
    ? 'ANTHROPIC_API_KEY'
    : 'OPENAI_API_KEY';
  
  return `name: Open Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: elliottlawson/open-review-action@main
        with:
          provider: ${options.provider}
          model: ${options.model}
          api_key: \${{ secrets.${apiKeySecret} }}
`;
}

// ============================================================================
// Quick (Non-Interactive) Init
// ============================================================================

async function runQuickInit(
  cwd: string, 
  flags: InitFlags, 
  configExists: boolean, 
  workflowExists: boolean
): Promise<void> {
  console.log('\n🔧 Open Review Quick Setup\n');
  
  // Check for existing files
  if ((configExists || workflowExists) && !flags.force) {
    console.error('⚠️  Existing files detected:');
    if (configExists) console.error('   - .open-review.yml');
    if (workflowExists) console.error('   - .github/workflows/open-review.yml');
    console.error('\nUse --force to overwrite existing files.');
    process.exit(1);
  }
  
  // Detect project type
  const detectedType = detectProjectType(cwd);
  const typeInfo = PROJECT_TYPES[detectedType];
  console.log(`📁 Detected project type: ${typeInfo.name}`);
  
  // Build options from flags + defaults
  const options: InitOptions = {
    provider: flags.provider || 'anthropic',
    model: flags.model || (flags.provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514'),
    projectType: detectedType,
    ignorePatterns: [...typeInfo.ignores],
    useLinear: false,
  };
  
  // Auto-detect instructions file
  const detectedInstructions = detectInstructionsFile(cwd);
  if (detectedInstructions) {
    console.log(`✓ Found instructions file: ${detectedInstructions}`);
    options.instructionsFile = detectedInstructions;
  }
  
  // Generate and write files
  writeInitFiles(cwd, options);
  
  // Print next steps
  printNextSteps(options);
}

// ============================================================================
// File Writing (shared between interactive and quick modes)
// ============================================================================

function writeInitFiles(cwd: string, options: InitOptions): void {
  console.log('\n📝 Creating files...\n');
  
  // Config file
  const configContent = generateConfig(options);
  writeFileSync(join(cwd, '.open-review.yml'), configContent);
  console.log('   ✓ Created .open-review.yml');
  
  // Workflow file
  const workflowDir = join(cwd, '.github', 'workflows');
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }
  const workflowContent = generateWorkflow(options);
  writeFileSync(join(workflowDir, 'open-review.yml'), workflowContent);
  console.log('   ✓ Created .github/workflows/open-review.yml');
}

function printNextSteps(options: InitOptions): void {
  console.log('\n' + '='.repeat(50));
  console.log('✅ Setup complete!\n');
  console.log('Next steps:\n');
  
  console.log('1. Add your API key to GitHub Secrets:');
  console.log('   Go to: Settings → Secrets and variables → Actions');
  if (options.provider === 'anthropic') {
    console.log('   Add secret: ANTHROPIC_API_KEY');
  } else {
    console.log('   Add secret: OPENAI_API_KEY');
  }
  if (options.useLinear) {
    console.log('   Add secret: LINEAR_API_KEY');
  }
  
  if (!options.instructionsFile) {
    console.log('\n2. (Optional) Create a CONVENTIONS.md file:');
    console.log('   Add your coding standards and the reviewer will enforce them.');
  }
  
  console.log('\n3. Commit and push these files:');
  console.log('   git add .open-review.yml .github/workflows/open-review.yml');
  console.log('   git commit -m "Add Open Review automated code review"');
  console.log('   git push');
  
  console.log('\n4. Open a PR to see it in action!');
  console.log('');
}

// ============================================================================
// Main Init Function
// ============================================================================

export async function runInit(cwd: string = process.cwd(), flags: InitFlags = { quick: false, force: false }): Promise<void> {
  const configExists = existsSync(join(cwd, '.open-review.yml'));
  const workflowExists = existsSync(join(cwd, '.github/workflows/open-review.yml'));
  
  // Quick mode: non-interactive setup with sensible defaults
  if (flags.quick) {
    return runQuickInit(cwd, flags, configExists, workflowExists);
  }
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  console.log('\n🔧 Open Review Setup\n');
  console.log('This wizard will create:');
  console.log('  1. .open-review.yml - Configuration file');
  console.log('  2. .github/workflows/open-review.yml - GitHub Action workflow\n');
  
  // Check for existing files
  if (configExists || workflowExists) {
    console.log('⚠️  Existing files detected:');
    if (configExists) console.log('   - .open-review.yml');
    if (workflowExists) console.log('   - .github/workflows/open-review.yml');
    
    const overwrite = await promptYesNo(rl, 'Overwrite existing files?', false);
    if (!overwrite) {
      console.log('\nSetup cancelled.');
      rl.close();
      return;
    }
    console.log('');
  }
  
  // Detect project type
  const detectedType = detectProjectType(cwd);
  const typeInfo = PROJECT_TYPES[detectedType];
  console.log(`📁 Detected project type: ${typeInfo.name}`);
  
  // Initialize options with detected values
  const options: InitOptions = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    projectType: detectedType,
    ignorePatterns: [...typeInfo.ignores],
    useLinear: false,
  };
  
  // Provider selection
  const providerChoice = await promptChoice(
    rl,
    'Which LLM provider do you want to use?',
    ['Anthropic (Claude) - Recommended', 'OpenAI (GPT-4)'],
    0
  );
  options.provider = providerChoice === 0 ? 'anthropic' : 'openai';
  options.model = providerChoice === 0 ? 'claude-sonnet-4-20250514' : 'gpt-4o';
  
  // Check for instructions file
  const detectedInstructions = detectInstructionsFile(cwd);
  if (detectedInstructions) {
    console.log(`\n✓ Found instructions file: ${detectedInstructions}`);
    options.instructionsFile = detectedInstructions;
  } else {
    const wantInstructions = await promptYesNo(
      rl,
      '\nDo you have a coding conventions/standards file?',
      false
    );
    if (wantInstructions) {
      const path = await prompt(rl, 'Path to file: ');
      if (path && existsSync(join(cwd, path))) {
        options.instructionsFile = path;
      } else if (path) {
        console.log(`  ⚠️  File not found: ${path}`);
        console.log('  You can add it later in .open-review.yml');
      }
    }
  }
  
  // Confirm ignore patterns
  console.log(`\nSuggested ignore patterns for ${typeInfo.name}:`);
  for (const pattern of options.ignorePatterns) {
    console.log(`  - ${pattern}`);
  }
  const useIgnores = await promptYesNo(rl, 'Use these ignore patterns?', true);
  if (!useIgnores) {
    options.ignorePatterns = [];
  }
  
  // Linear integration
  options.useLinear = await promptYesNo(
    rl,
    'Do you use Linear for issue tracking?',
    false
  );
  
  rl.close();
  
  // Generate and write files using shared helper
  writeInitFiles(cwd, options);
  
  // Print next steps using shared helper
  printNextSteps(options);
}
