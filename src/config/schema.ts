/**
 * Configuration Schema
 * 
 * Defines the structure of .open-review.yml
 */

import { z } from 'zod';

// ============================================================================
// Schema Definition
// ============================================================================

const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'openrouter']).default('anthropic'),
  model: z.string().default('claude-sonnet-4-20250514'),
  api_key: z.string().optional(),
});

const ReviewConfigSchema = z.object({
  // File containing review instructions/conventions
  instructions_file: z.string().optional(),

  // Additional inline instructions (prepended to file content in agent prompt with ## header)
  instructions: z.string().optional(),

  // Flag PRs with empty descriptions
  flag_empty_description: z.boolean().default(true),
});

const SectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  collapse: z.enum(['auto', 'always', 'never']).default('auto'),
});

const VerdictLabelSchema = z.object({
  label: z.string(),
});

const OutputConfigSchema = z.object({
  format: z.enum(['human', 'json']).default('human'),
  colors: z.enum(['auto', 'true', 'false']).default('auto'),
  timezone: z.string().default('America/New_York'),
  sections: z.object({
    must_fix: SectionConfigSchema.default({ enabled: true, collapse: 'auto' }),
    should_fix: SectionConfigSchema.default({ enabled: true, collapse: 'auto' }),
    suggestions: SectionConfigSchema.default({ enabled: true, collapse: 'auto' }),
    questions: SectionConfigSchema.default({ enabled: true, collapse: 'auto' }),
  }).default({
    must_fix: { enabled: true, collapse: 'auto' },
    should_fix: { enabled: true, collapse: 'auto' },
    suggestions: { enabled: true, collapse: 'auto' },
    questions: { enabled: true, collapse: 'auto' },
  }),
  verdicts: z.object({
    approve: VerdictLabelSchema.default({ label: 'LGTM' }),
    changes_needed: VerdictLabelSchema.default({ label: 'Changes Needed' }),
    hold: VerdictLabelSchema.default({ label: 'Hold' }),
  }).default({
    approve: { label: 'LGTM' },
    changes_needed: { label: 'Changes Needed' },
    hold: { label: 'Hold' },
  }),
});

export const ConfigSchema = z.object({
  llm: LLMConfigSchema.optional(),
  review: ReviewConfigSchema.optional(),
  // Files/paths to ignore (glob patterns)
  ignore: z.array(z.string()).optional(),
  output: OutputConfigSchema.optional(),
});

// ============================================================================
// Types
// ============================================================================

export type OpenReviewYamlConfig = z.infer<typeof ConfigSchema>;
export type SectionConfig = z.infer<typeof SectionConfigSchema>;
export type VerdictLabelConfig = z.infer<typeof VerdictLabelSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// Fully resolved config with all defaults applied
export interface ResolvedConfig {
  llm: z.infer<typeof LLMConfigSchema>;
  review: z.infer<typeof ReviewConfigSchema>;
  ignore: string[];
  output: z.infer<typeof OutputConfigSchema>;
}

// Apply defaults to partial config
export function resolveConfig(config: OpenReviewYamlConfig): ResolvedConfig {
  return {
    llm: LLMConfigSchema.parse(config.llm ?? {}),
    review: ReviewConfigSchema.parse(config.review ?? {}),
    ignore: config.ignore ?? [],
    output: OutputConfigSchema.parse(config.output ?? {}),
  };
}

// Default config (when no .open-review.yml exists)
export const DEFAULT_CONFIG: ResolvedConfig = resolveConfig({});
