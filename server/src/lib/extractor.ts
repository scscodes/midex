/**
 * Extractor - Stage 1 of ETL pipeline
 * Finds and reads resources from filesystem or other sources
 */

import { readdir, readFile, stat, access } from 'fs/promises';
import { constants } from 'fs';
import { join, relative } from 'path';
import type { ExtractOptions, RawResource, ResourceMetadata } from '../types.js';
import { computeHash } from './hash.js';

/**
 * Base extractor for filesystem resources
 */
export class FilesystemExtractor {
  /**
   * Extract resources from filesystem matching patterns
   */
  async extract(resourceType: string, options: ExtractOptions): Promise<RawResource[]> {
    const { basePath, patterns = ['**/*.md'], exclude = [] } = options;
    const resources: RawResource[] = [];

    // Check if basePath exists before attempting to extract
    try {
      await access(basePath, constants.F_OK);
    } catch {
      // Directory doesn't exist - return empty array (graceful degradation)
      return resources;
    }

    try {
      const files = await this.findFiles(basePath, patterns, exclude);

      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const stats = await stat(filePath);
          const hash = computeHash(content);
          const relativePath = relative(basePath, filePath);

          // Extract name from filename (without extension)
          const name = this.extractName(relativePath);

          const metadata: ResourceMetadata = {
            path: relativePath,
            hash,
            lastModified: stats.mtime,
          };

          resources.push({
            type: resourceType,
            name,
            content,
            metadata,
          });
        } catch (error) {
          console.error(`Failed to extract ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error(`Failed to extract resources from ${basePath}:`, error);
    }

    return resources;
  }

  /**
   * Find files matching patterns
   */
  private async findFiles(basePath: string, patterns: string[], exclude: string[]): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      // Check if directory exists before reading
      try {
        await access(dir, constants.F_OK);
      } catch {
        // Directory doesn't exist - skip silently
        return;
      }

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          // Skip excluded patterns
          if (this.shouldExclude(entry.name, exclude)) {
            continue;
          }

          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && this.matchesPatterns(entry.name, patterns)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Only log if it's not a "directory doesn't exist" error
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
          console.error(`Failed to walk directory ${dir}:`, error);
        }
      }
    };

    await walk(basePath);
    return files;
  }

  /**
   * Check if filename matches any pattern
   */
  private matchesPatterns(filename: string, patterns: string[]): boolean {
    // Simple pattern matching (supports *.ext and **/*.ext)
    return patterns.some((pattern) => {
      // Remove leading glob patterns to get extension
      const ext = pattern.replace(/^\*\*\//, '').replace(/^\*/, '');
      return filename.endsWith(ext);
    });
  }

  /**
   * Check if should exclude based on patterns
   */
  private shouldExclude(name: string, exclude: string[]): boolean {
    return (
      name.startsWith('_') ||
      name.startsWith('.') ||
      exclude.some((pattern) => name.includes(pattern))
    );
  }

  /**
   * Extract name from relative path
   */
  private extractName(relativePath: string): string {
    const parts = relativePath.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    return filename?.replace(/\.[^/.]+$/, '') || '';
  }
}
