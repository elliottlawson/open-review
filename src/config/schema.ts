/**
 * Configuration Schema
 *
 * Defines the structure of .open-review/config.yml
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
  methodology: z.enum(['default']).or(z.string()).default('default'),
  presets: z.enum(['auto']).or(z.array(z.string())).default('auto'),
  conventions: z.union([
    z.enum(['auto']),
    z.string(),
  ]).default('auto'),
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
  path: z.string().optional(),
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
  version: z.string().default('1.0'),
  review: ReviewConfigSchema.default({
    methodology: 'default',
    presets: 'auto',
    conventions: 'auto',
  }),
  llm: LLMConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
});

// ============================================================================
// Types
// ============================================================================

export type OpenReviewConfig = z.infer<typeof ConfigSchema>;
export type SectionConfig = z.infer<typeof SectionConfigSchema>;
export type VerdictLabelConfig = z.infer<typeof VerdictLabelSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// Fully resolved config with all defaults applied
export interface ResolvedConfig {
  version: string;
  review: z.infer<typeof ReviewConfigSchema>;
  llm: z.infer<typeof LLMConfigSchema>;
  output: z.infer<typeof OutputConfigSchema>;
}

// Apply defaults to partial config
export function resolveConfig(config: OpenReviewConfig): ResolvedConfig {
  return {
    version: config.version,
    review: ReviewConfigSchema.parse(config.review ?? {}),
    llm: LLMConfigSchema.parse(config.llm ?? {}),
    output: OutputConfigSchema.parse(config.output ?? {}),
  };
}

// Default config (when no config file exists)
export const DEFAULT_CONFIG: ResolvedConfig = resolveConfig(ConfigSchema.parse({}));
