import { createContentFactory } from '../lib/content/factory-generator';
import { RuleSchema, RuleFrontmatterSchema, type Rule, type RuleFrontmatter } from './schema';

/**
 * Rule factory - uses generic factory generator
 */
export const RuleFactory = createContentFactory({
  typeName: 'Rule',
  subdirectory: 'rules',
  frontmatterSchema: RuleFrontmatterSchema,
  schema: RuleSchema,
  buildCandidate: (
    frontmatter: RuleFrontmatter,
    content: string,
    relPath: string,
    fileHash?: string
  ) => ({
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    globs: frontmatter.globs,
    alwaysApply: frontmatter.alwaysApply,
    tags: frontmatter.tags,
    path: relPath,
    fileHash,
  }),
});

export type { Rule, RuleFrontmatter };
