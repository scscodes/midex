import { resolve, dirname } from 'path';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { normalizePath } from './lib/path';
import { detectGitRepository } from './lib/git';
import { resolveConfig, type ResolvedDiscoveryConfig } from './lib/config';
import { DiscoveryOptionsSchema } from './schemas';
import type { DiscoveryOptions, DiscoveryResult, ProjectInfo } from './schemas';
import { PathNotFoundError, InvalidPathError } from './errors';


/**
 * Project Discovery & Reconciliation System
 *
 * Discovers projects via autodiscovery (scanning parent directory) or
 * user-supplied paths. Validates projects by detecting .git directories.
 */
export class ProjectDiscovery {
  /**
   * Discover projects using autodiscovery or manual path
   */
  static async discover(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    // Validate input schema once
    const validatedOptions = DiscoveryOptionsSchema.parse(options);
    const config = resolveConfig(validatedOptions);

    if (config.method === 'autodiscover') {
      return await this.autodiscover(config);
    } else {
      if (!validatedOptions.targetPath) {
        throw new Error('targetPath is required for manual discovery');
      }
      return await this.discoverFromPath(validatedOptions.targetPath, config);
    }
  }

  /**
   * Autodiscover: Scan parent directory for neighbor projects
   */
  private static async autodiscover(config: ResolvedDiscoveryConfig): Promise<DiscoveryResult> {
    const currentPath = process.cwd();
    const parentPath = dirname(currentPath);

    // Validate parent directory exists
    if (!existsSync(parentPath)) {
      return { projects: [], discovered: 0, valid: 0 };
    }

    try {
      const entries = await readdir(parentPath, { withFileTypes: true });
      const projects: ProjectInfo[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip hidden directories if configured
        if (config.skipHidden && entry.name.startsWith('.')) {
          continue;
        }

        const projectPath = resolve(parentPath, entry.name);
        const normalizedPath = normalizePath(projectPath);

        // Skip current directory
        if (normalizedPath === normalizePath(currentPath)) {
          continue;
        }

        const isGitRepository = detectGitRepository(projectPath);

        projects.push({
          path: normalizedPath,
          name: entry.name,
          isGitRepository,
        });
      }

      const valid = projects.filter(p => p.isGitRepository).length;

      return {
        projects,
        discovered: projects.length,
        valid,
      };
    } catch (error) {
      throw new Error(`Failed to autodiscover projects: ${error}`);
    }
  }

  /**
   * Manual discovery: Discover from user-supplied path
   */
  private static async discoverFromPath(targetPath: string, config: ResolvedDiscoveryConfig): Promise<DiscoveryResult> {
    const normalizedPath = normalizePath(resolve(targetPath));

    // Validate path exists
    if (!existsSync(normalizedPath)) {
      throw new PathNotFoundError(normalizedPath);
    }

    const stats = statSync(normalizedPath);

    if (stats.isFile()) {
      throw new InvalidPathError(normalizedPath, 'Path is a file, expected directory');
    }

    // Recursive scan with depth control
    const projects = await this.scanDirectory(normalizedPath, 0, config);
    const valid = projects.filter(p => p.isGitRepository).length;

    return {
      projects,
      discovered: projects.length,
      valid,
    };
  }

  /**
   * Recursively scan directory for projects
   */
  private static async scanDirectory(
    dirPath: string,
    currentDepth: number,
    config: ResolvedDiscoveryConfig
  ): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    const normalizedPath = normalizePath(dirPath);
    const isGitRepository = detectGitRepository(normalizedPath);

    // Add current directory
    projects.push({
      path: normalizedPath,
      name: normalizedPath.split(/[/\\]/).pop() || normalizedPath,
      isGitRepository,
    });

    // Stop recursion if max depth reached
    if (currentDepth >= config.maxDepth) {
      return projects;
    }

    // Scan subdirectories
    try {
      const entries = await readdir(normalizedPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip hidden directories if configured
        if (config.skipHidden && entry.name.startsWith('.')) {
          continue;
        }

        const subPath = resolve(normalizedPath, entry.name);
        const subProjects = await this.scanDirectory(subPath, currentDepth + 1, config);
        projects.push(...subProjects);
      }
    } catch (error) {
      // If we can't read subdirectories, that's okay - continue with what we have
    }

    return projects;
  }

  /**
   * Validate a project path (check if it's a git repository)
   */
  static validateProject(path: string): boolean {
    const normalizedPath = normalizePath(resolve(path));
    return detectGitRepository(normalizedPath);
  }
}

// Re-export public types and schemas
export * from './errors';
export * from './schemas';
export type { DiscoveryMethod, DiscoveryOptions, DiscoveryResult, ProjectInfo } from './schemas';

