/**
 * Agent skill lifecycle commands.
 *
 * Installs Open Review into host-native skill and command locations without
 * invoking the standalone review harness.
 */

import { createHash } from 'crypto';
import { createInterface } from 'readline';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SkillTarget = 'agents' | 'claude' | 'opencode' | 'gemini' | 'codex' | 'windsurf' | 'cursor';
type TargetMode = 'skill' | 'command' | 'workflow' | 'rule' | 'managed-block';

interface SkillCommandFlags {
  subcommand: 'install' | 'status' | 'update' | 'remove' | '';
  targets: SkillTarget[];
  all: boolean;
  force: boolean;
  yes: boolean;
  commandName: string;
}

interface ManifestTarget {
  id: string;
  path: string;
  mode: TargetMode;
  checksum?: string;
}

interface Manifest {
  version: string;
  skills: {
    'open-review'?: {
      version: string;
      source: string;
      checksum: string;
      command: string;
      installed_at: string;
      targets: ManifestTarget[];
    };
  };
}

interface InstallOptions {
  targets?: SkillTarget[];
  commandName?: string;
  force?: boolean;
  interactive?: boolean;
}

interface TargetFile {
  id: string;
  path: string;
  mode: TargetMode;
  content: string;
}

const SKILL_VERSION = '0.1.0';
const DEFAULT_COMMAND = 'review';
const SKILL_SOURCE = resolve(__dirname, '../../skills/open-review/SKILL.md');
const MANIFEST_PATH = '.open-review/skills.yml';

const TARGET_LABELS: Record<SkillTarget, string> = {
  agents: 'Agent Skills standard (.agents)',
  claude: 'Claude Code',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
  codex: 'Codex',
  windsurf: 'Windsurf',
  cursor: 'Cursor',
};

const TARGETS: SkillTarget[] = ['agents', 'claude', 'opencode', 'gemini', 'codex', 'windsurf', 'cursor'];

const RESERVED_COMMANDS: Partial<Record<SkillTarget, string[]>> = {
  codex: ['review'],
};

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
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

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function ensureParent(path: string): void {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function packageSkillContent(): string {
  return readFileSync(SKILL_SOURCE, 'utf-8');
}

function readManifest(cwd: string): Manifest {
  const path = join(cwd, MANIFEST_PATH);
  if (!existsSync(path)) {
    return { version: '1.0', skills: {} };
  }

  const parsed = parseYaml(readFileSync(path, 'utf-8')) as Manifest | null;
  return parsed ?? { version: '1.0', skills: {} };
}

function writeManifest(cwd: string, manifest: Manifest): void {
  const path = join(cwd, MANIFEST_PATH);
  ensureParent(path);
  writeFileSync(path, stringifyYaml(manifest));
}

function commandAllowed(target: SkillTarget, commandName: string): boolean {
  return !RESERVED_COMMANDS[target]?.includes(commandName);
}

function normalizeCommandName(commandName: string): string {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(commandName) ? commandName : DEFAULT_COMMAND;
}

function markdownCommand(commandName: string): string {
  return `---\ndescription: Review current changes with Open Review\n---\nPerform an Open Review code review using the open-review skill.\n\nReview target: $ARGUMENTS\n`;
}

function geminiCommand(): string {
  return `description = "Review current changes with Open Review"\n\nprompt = """\nPerform an Open Review code review using the open-review skill.\n\nReview target: {{args}}\n"""\n`;
}

function windsurfWorkflow(): string {
  return `# Open Review\n\nReview current changes using the Open Review skill.\n\n1. Activate the \`open-review\` skill.\n2. Use the user's command arguments as the review target when provided.\n3. Present findings first with file and line references.\n`;
}

function cursorRule(): string {
  return `---\ndescription: Open Review code review workflow\nalwaysApply: false\n---\n\nWhen the user asks for a code review, PR review, peer review, or pre-merge review, use the Open Review workflow from \`.agents/skills/open-review/SKILL.md\`.\n`;
}

function targetFiles(target: SkillTarget, skillContent: string, commandName: string): TargetFile[] {
  const skillPathByTarget: Partial<Record<SkillTarget, string>> = {
    agents: '.agents/skills/open-review/SKILL.md',
    claude: '.claude/skills/open-review/SKILL.md',
    opencode: '.opencode/skills/open-review/SKILL.md',
    gemini: '.gemini/skills/open-review/SKILL.md',
    codex: '.agents/skills/open-review/SKILL.md',
    windsurf: '.windsurf/skills/open-review/SKILL.md',
  };

  const files: TargetFile[] = [];
  const skillPath = skillPathByTarget[target];
  if (skillPath) {
    files.push({ id: `${target}-skill`, path: skillPath, mode: 'skill', content: skillContent });
  }

  if (target === 'opencode' && commandAllowed(target, commandName)) {
    files.push({ id: 'opencode-command', path: `.opencode/commands/${commandName}.md`, mode: 'command', content: markdownCommand(commandName) });
  }

  if (target === 'gemini' && commandAllowed(target, commandName)) {
    files.push({ id: 'gemini-command', path: `.gemini/commands/${commandName}.toml`, mode: 'command', content: geminiCommand() });
  }

  if (target === 'windsurf' && commandAllowed(target, commandName)) {
    files.push({ id: 'windsurf-workflow', path: `.windsurf/workflows/${commandName}.md`, mode: 'workflow', content: windsurfWorkflow() });
  }

  if (target === 'cursor') {
    files.push({ id: 'cursor-rule', path: '.cursor/rules/open-review.mdc', mode: 'rule', content: cursorRule() });
  }

  return files;
}

function suggestedTargets(cwd: string): SkillTarget[] {
  const suggestions: SkillTarget[] = ['agents'];
  const checks: Array<[SkillTarget, string[]]> = [
    ['claude', ['CLAUDE.md', '.claude']],
    ['opencode', ['AGENTS.md', '.opencode']],
    ['gemini', ['GEMINI.md', '.gemini']],
    ['codex', ['AGENTS.md', '.codex']],
    ['windsurf', ['.windsurf']],
    ['cursor', ['.cursor', '.cursorrules']],
  ];

  for (const [target, paths] of checks) {
    if (paths.some((path) => existsSync(join(cwd, path)))) {
      suggestions.push(target);
    }
  }

  return [...new Set(suggestions)];
}

async function chooseTargets(cwd: string, defaults: SkillTarget[]): Promise<SkillTarget[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const selected: SkillTarget[] = [];

  console.log('\nWhere should Open Review be installed?\n');
  for (const target of TARGETS) {
    const defaultValue = defaults.includes(target);
    const useTarget = await promptYesNo(rl, `${TARGET_LABELS[target]}?`, defaultValue);
    if (useTarget) selected.push(target);
  }

  rl.close();
  return selected;
}

function installTargetFile(cwd: string, file: TargetFile, force: boolean, manifestTargets: ManifestTarget[]): boolean {
  const fullPath = join(cwd, file.path);
  const existingManifest = manifestTargets.find((target) => target.path === file.path);

  if (existsSync(fullPath) && !force) {
    const existingContent = readFileSync(fullPath, 'utf-8');
    if (!existingManifest || existingManifest.checksum !== checksum(existingContent)) {
      console.log(`  ⏭  Skipped modified file: ${file.path}`);
      return false;
    }
  }

  ensureParent(fullPath);
  writeFileSync(fullPath, file.content);
  console.log(`  ✓  Installed: ${file.path}`);
  return true;
}

export async function installSkills(cwd: string, options: InstallOptions = {}): Promise<void> {
  const commandName = normalizeCommandName(options.commandName || DEFAULT_COMMAND);
  const skillContent = packageSkillContent();
  const manifest = readManifest(cwd);
  const previousTargets = manifest.skills['open-review']?.targets ?? [];
  let targets = options.targets;

  if (!targets || targets.length === 0) {
    const defaults = suggestedTargets(cwd);
    targets = options.interactive === false ? defaults : await chooseTargets(cwd, defaults);
  }

  const files = targets.flatMap((target) => targetFiles(target, skillContent, commandName));
  const uniqueFiles = Array.from(new Map(files.map((file) => [file.path, file])).values());
  const installedTargets: ManifestTarget[] = [];

  console.log('\n📄 Agent Skills\n');
  for (const file of uniqueFiles) {
    if (installTargetFile(cwd, file, options.force ?? false, previousTargets)) {
      installedTargets.push({ id: file.id, path: file.path, mode: file.mode, checksum: checksum(file.content) });
    }
  }

  manifest.skills['open-review'] = {
    version: SKILL_VERSION,
    source: 'skills/open-review/SKILL.md',
    checksum: checksum(skillContent),
    command: commandName,
    installed_at: new Date().toISOString(),
    targets: installedTargets,
  };
  writeManifest(cwd, manifest);
  console.log(`  ✓  Updated: ${MANIFEST_PATH}`);
}

function showStatus(cwd: string): void {
  const manifest = readManifest(cwd);
  const skill = manifest.skills['open-review'];

  console.log('\nOpen Review Skills\n');
  if (!skill) {
    console.log('No Open Review skills installed.');
    return;
  }

  console.log(`Command: /${skill.command}`);
  console.log(`Version: ${skill.version}`);
  console.log('\nTargets:');
  for (const target of skill.targets) {
    const fullPath = join(cwd, target.path);
    const state = existsSync(fullPath)
      ? checksum(readFileSync(fullPath, 'utf-8')) === target.checksum ? 'current' : 'modified'
      : 'missing';
    console.log(`  ${target.path}  ${state}`);
  }
}

function removeSkills(cwd: string, force: boolean): void {
  const manifest = readManifest(cwd);
  const skill = manifest.skills['open-review'];

  if (!skill) {
    console.log('No Open Review skills installed.');
    return;
  }

  for (const target of skill.targets) {
    const fullPath = join(cwd, target.path);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    if (!force && target.checksum && checksum(content) !== target.checksum) {
      console.log(`  ⏭  Skipped modified file: ${target.path}`);
      continue;
    }

    rmSync(fullPath);
    console.log(`  ✓  Removed: ${target.path}`);
  }

  delete manifest.skills['open-review'];
  writeManifest(cwd, manifest);
  console.log(`  ✓  Updated: ${MANIFEST_PATH}`);
}

export function parseSkillsArgs(args: string[]): SkillCommandFlags {
  const flags: SkillCommandFlags = {
    subcommand: (args[0] as SkillCommandFlags['subcommand']) || '',
    targets: [],
    all: false,
    force: false,
    yes: false,
    commandName: DEFAULT_COMMAND,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target') {
      const target = args[++i] as SkillTarget;
      if (TARGETS.includes(target)) flags.targets.push(target);
    } else if (arg === '--all') {
      flags.all = true;
    } else if (arg === '--force' || arg === '-f') {
      flags.force = true;
    } else if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg === '--command') {
      flags.commandName = normalizeCommandName(args[++i] || DEFAULT_COMMAND);
    }
  }

  return flags;
}

export async function runSkillsCommand(cwd: string, flags: SkillCommandFlags): Promise<void> {
  switch (flags.subcommand) {
    case 'install':
      await installSkills(cwd, {
        targets: flags.all ? TARGETS : flags.targets,
        commandName: flags.commandName,
        force: flags.force,
        interactive: !flags.yes && !flags.all && flags.targets.length === 0,
      });
      break;

    case 'status':
      showStatus(cwd);
      break;

    case 'update':
      await installSkills(cwd, {
        targets: flags.all ? TARGETS : flags.targets,
        commandName: flags.commandName,
        force: flags.force,
        interactive: false,
      });
      break;

    case 'remove':
      removeSkills(cwd, flags.force);
      break;

    default:
      console.log(`Usage: open-review skills install|status|update|remove [--target <name>] [--all] [--command <name>] [--force]`);
  }
}
