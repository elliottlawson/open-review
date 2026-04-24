/**
 * Prompt Composition Engine
 *
 * Builds the system prompt as semantic layers rather than a flat string.
 * Project conventions are spliced at the semantic center (after ecosystem,
 * before security) so they augment — not override — the core methodology.
 */

import {
  UNDERSTAND_MISSION,
  EVALUATE_APPROACH,
  ASSESS_ECOSYSTEM,
  CHECK_PROJECT_CONVENTIONS,
  SECURITY_REVIEW,
  CODE_QUALITY,
  COMMUNICATION_STYLE,
} from './methodology.js';
import { OUTPUT_FORMAT } from './output-format.js';

export interface PromptCompositionConfig {
  /** Project conventions — spliced into methodology step 4 */
  instructions?: string;
  /** Project playbook file content — spliced into methodology step 4 */
  instructionsFile?: string;
  /** Which finding categories the agent should generate */
  sections?: {
    must_fix: { enabled: boolean };
    should_fix: { enabled: boolean };
    suggestions: { enabled: boolean };
    questions: { enabled: boolean };
  };
  /** Ephemeral focus for this review */
  prompt?: string;
}

const SPLICE_MARKER = '[SPLICE: PROJECT_CONVENTIONS_GO_HERE]';

function buildProjectConventionsSection(
  instructions?: string,
  instructionsFile?: string
): string {
  const parts: string[] = [];

  if (instructions) {
    parts.push(instructions);
  }

  if (instructionsFile) {
    parts.push(instructionsFile);
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join('\n\n');
}

function buildMethodology(instructions?: string, instructionsFile?: string): string {
  const conventions = buildProjectConventionsSection(instructions, instructionsFile);

  const methodologyParts = [
    UNDERSTAND_MISSION,
    EVALUATE_APPROACH,
    ASSESS_ECOSYSTEM,
    CHECK_PROJECT_CONVENTIONS,
    SECURITY_REVIEW,
    CODE_QUALITY,
    COMMUNICATION_STYLE,
  ];

  if (conventions) {
    // Replace the splice marker with the actual conventions
    const methodologyWithConventions = methodologyParts.map((part) =>
      part.includes(SPLICE_MARKER) ? part.replace(SPLICE_MARKER, conventions) : part
    );
    return methodologyWithConventions.join('\n\n');
  }

  // No conventions provided — remove the splice marker entirely
  const methodologyWithoutMarker = methodologyParts.map((part) =>
    part.includes(SPLICE_MARKER)
      ? part.replace(SPLICE_MARKER, 'No project-specific conventions were provided. Evaluate against general best practices.')
      : part
  );

  return methodologyWithoutMarker.join('\n\n');
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
  const parts: string[] = [
    `You are an expert code reviewer. Your job is to thoroughly review code changes and provide actionable, constructive feedback.`,
  ];

  // Layer 0: Methodology
  parts.push(buildMethodology(config.instructions, config.instructionsFile));

  // Layer 1: Output Format & Discipline
  parts.push(OUTPUT_FORMAT);

  // Layer 2: Output Scope
  const outputScope = buildOutputScope(config.sections);
  if (outputScope) {
    parts.push(outputScope);
  }

  // Layer 3: Ephemeral Focus
  if (config.prompt) {
    parts.push(`## Review Focus\n\n${config.prompt}`);
  }

  return parts.join('\n\n');
}
