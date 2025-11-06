import { createContentFactory } from '../lib/content/factory-generator';
import { WorkflowSchema, WorkflowFrontmatterSchema, type Workflow, type WorkflowFrontmatter } from './schema';

/**
 * Workflow factory - uses generic factory generator
 */
export const WorkflowFactory = createContentFactory({
  typeName: 'Workflow',
  subdirectory: 'workflows',
  frontmatterSchema: WorkflowFrontmatterSchema,
  schema: WorkflowSchema,
  buildCandidate: (
    frontmatter: WorkflowFrontmatter,
    content: string,
    relPath: string,
    fileHash?: string
  ) => ({
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    tags: frontmatter.tags,
    triggers: frontmatter.keywords ? { keywords: frontmatter.keywords } : undefined,
    complexity: frontmatter.complexity,
    phases: frontmatter.phases,
    path: relPath,
    fileHash,
  }),
});

export type { Workflow, WorkflowFrontmatter };
