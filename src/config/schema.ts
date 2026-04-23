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
