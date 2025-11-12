import { createContentFactory } from '../lib/content/factory-generator.js';
import { AgentSchema, AgentFrontmatterSchema, type Agent, type AgentFrontmatter } from './schema.js';

/**
 * Agent factory - uses generic factory generator
 */
export const AgentFactory = createContentFactory({
  typeName: 'Agent',
  subdirectory: 'agents',
  frontmatterSchema: AgentFrontmatterSchema,
  schema: AgentSchema,
  buildCandidate: (
    frontmatter: AgentFrontmatter,
    content: string,
    relPath: string,
    fileHash?: string
  ) => ({
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    metadata: {
      tags: frontmatter.tags || [],
      version: frontmatter.version,
    },
    path: relPath,
    fileHash,
  }),
});

export type { Agent, AgentFrontmatter };
