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
});

const ReviewConfigSchema = z.object({
  // File containing review instructions/conventions
  instructions_file: z.string().optional(),

  // Additional inline instructions (appended to file if both present)
  instructions: z.string().optional(),

  // Flag PRs with empty descriptions
  flag_empty_description: z.boolean().default(true),
});

const TemplateSectionSchema = z.object({
  enabled: z.boolean().default(true),
  default_open: z.boolean().optional(),
});

const FooterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  show_iteration_count: z.boolean().default(false),
  show_token_usage: z.boolean().default(false),
});

const TemplateConfigSchema = z.object({
  // Section visibility and behavior
  context: TemplateSectionSchema.optional(),
  must_fix: TemplateSectionSchema.optional(),
  should_fix: TemplateSectionSchema.optional(),
  suggestions: TemplateSectionSchema.optional(),
  questions: TemplateSectionSchema.optional(),
  footer: FooterConfigSchema.optional(),
});

export const ConfigSchema = z.object({
  llm: LLMConfigSchema.optional(),
  review: ReviewConfigSchema.optional(),
  // Files/paths to ignore (glob patterns)
  ignore: z.array(z.string()).optional(),
});

// ============================================================================
// Types
// ============================================================================

export type OpenReviewYamlConfig = z.infer<typeof ConfigSchema>;

// Fully resolved config with all defaults applied
export interface ResolvedConfig {
  llm: z.infer<typeof LLMConfigSchema>;
  review: z.infer<typeof ReviewConfigSchema>;
  ignore: string[];
}

// Apply defaults to partial config
export function resolveConfig(config: OpenReviewYamlConfig): ResolvedConfig {
  return {
    llm: LLMConfigSchema.parse(config.llm ?? {}),
    review: ReviewConfigSchema.parse(config.review ?? {}),
    ignore: config.ignore ?? [],
  };
}

// Default config (when no .open-review.yml exists)
export const DEFAULT_CONFIG: ResolvedConfig = resolveConfig({});
