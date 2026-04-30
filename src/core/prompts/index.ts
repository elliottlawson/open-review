/**
 * Prompt Composition Engine
 *
 * Builds the system prompt as semantic layers rather than a flat string.
 * Methodology is loaded at runtime from markdown files (built-in or local).
 * Project conventions are spliced at the semantic center (after ecosystem,
 * before security) so they augment — not override — the core methodology.
 */

import { loadMethodology, type MethodologyContent } from '../methodology-loader.js';

export interface PromptCompositionConfig {
  /** Project conventions — spliced into methodology step 4 */
  conventions?: string;
  /** Preset content — spliced into methodology step 3 */
  presets?: string[];
  /** Which finding categories the agent should generate */
  sections?: {
    must_fix: { enabled: boolean };
    should_fix: { enabled: boolean };
    suggestions: { enabled: boolean };
    questions: { enabled: boolean };
  };
  /** Ephemeral focus for this review */
  prompt?: string;
  /** Working directory for loading methodology */
  cwd?: string;
  /** Custom methodology path from config */
  methodologyPath?: string;
}

function spliceConventionsIntoMethodology(
  methodology: string,
  conventions?: string
): string {
  if (!conventions) {
    return methodology.replace(
      '<!-- Presets are spliced here by the harness when framework presets are configured -->',
      'No project-specific conventions were provided. Evaluate against general best practices.'
    );
  }

  return methodology.replace(
    '<!-- Presets are spliced here by the harness when framework presets are configured -->',
    conventions
  );
}

function splicePresetsIntoMethodology(
  methodology: string,
  presets?: string[]
): string {
  if (!presets || presets.length === 0) {
    return methodology;
  }

  const presetSection = presets.join('\n\n---\n\n');
  return methodology.replace(
    '<!-- Presets are spliced here by the harness when framework presets are configured -->',
    presetSection
  );
}

function buildMethodology(config: PromptCompositionConfig): string {
  const methodology = loadMethodology(
    config.cwd ?? process.cwd(),
    config.methodologyPath
  );

  let core = methodology.core;

  // Splice presets into step 3
  if (config.presets && config.presets.length > 0) {
    core = splicePresetsIntoMethodology(core, config.presets);
  }

  // Splice conventions into step 4
  core = spliceConventionsIntoMethodology(core, config.conventions);

  return core;
}

function buildOutputScope(
  sections: PromptCompositionConfig['sections']
): string {
  if (!sections) return '';

  const enabledSections: string[] = [];

  if (sections.must_fix.enabled) {
    enabledSections.push('- Critical issues (severity: critical, type: issue)');
  }
  if (sections.should_fix.enabled) {
    enabledSections.push('- Warnings (severity: warning, type: issue)');
  }
  if (sections.suggestions.enabled) {
    enabledSections.push('- Suggestions (severity: info, type: suggestion)');
  }
  if (sections.questions.enabled) {
    enabledSections.push('- Questions (type: question)');
  }

  if (enabledSections.length > 0) {
    return `## Output Scope\n\nGenerate findings for these categories:\n${enabledSections.join('\n')}`;
  }

  return `## Output Scope\n\nNo finding categories are enabled. Only generate a summary and verdict.`;
}

export function buildSystemPrompt(config: PromptCompositionConfig): string {
  const methodology = loadMethodology(
    config.cwd ?? process.cwd(),
    config.methodologyPath
  );

  const parts: string[] = [
    `You are an expert code reviewer. Your job is to thoroughly review code changes and provide actionable, constructive feedback.`,
  ];

  // Layer 0: Methodology (with presets and conventions spliced in)
  parts.push(buildMethodology(config));

  // Layer 1: Output Format & Discipline
  parts.push(`## Output Format\n\n${methodology.outputDiscipline}`);

  // Layer 2: Communication Style
  parts.push(`## Communication Style\n\n${methodology.communicationStyle}`);

  // Layer 3: Output Scope
  const outputScope = buildOutputScope(config.sections);
  if (outputScope) {
    parts.push(outputScope);
  }

  // Layer 4: Ephemeral Focus
  if (config.prompt) {
    parts.push(`## Review Focus\n\n${config.prompt}`);
  }

  return parts.join('\n\n');
}
