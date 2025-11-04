import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import parseFrontmatter from 'gray-matter';
import { NotFoundError } from '../../errors';

/**
 * Shared markdown parsing utilities
 */
export interface MarkdownParseResult<T = Record<string, unknown>> {
  frontmatter: T;
  content: string;
  relPath: string;
}

/**
 * Read and parse a markdown file with frontmatter
 */
export async function readMarkdown<T = Record<string, unknown>>(
  basePath: string,
  subdir: string,
  name: string
): Promise<MarkdownParseResult<T>> {
  const filePath = resolve(basePath, subdir, `${name}.md`);
  if (!existsSync(filePath)) {
    throw new NotFoundError(subdir.slice(0, -1) as 'agent' | 'rule' | 'workflow', name);
  }
  const raw = await readFile(filePath, 'utf-8');
  const { data, content } = parseFrontmatter(raw);
  return { frontmatter: data as T, content, relPath: `${subdir}/${name}.md` };
}
