/**
 * Output formatters
 */

export { formatForAgent, toJSON } from './agent.js';
export { formatForHuman } from './human.js';
export {
  renderComment,
  renderInlineComment,
  DEFAULT_TEMPLATE_CONFIG,
  MINIMAL_TEMPLATE_CONFIG,
  VERBOSE_TEMPLATE_CONFIG,
  loadTemplateConfig,
  type CommentTemplateConfig,
  type RenderCommentOptions,
} from './comment-template.js';
