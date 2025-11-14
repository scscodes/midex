#!/usr/bin/env tsx

/**
 * Setup script - gateway to setting up the app from zero to running
 *
 * This is the ONLY command required to go from zero to running.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { platform, arch } from 'os';

// ============================================================================
// Error Handling
// ============================================================================

class SetupError extends Error {
  constructor(
    public step: string,
    message: string,
    public cause?: unknown
  ) {
    super(`${step}: ${message}`);
    this.name = 'SetupError';
  }
}

// ============================================================================
// Safe Imports
// ============================================================================

async function safeImport(module: string, step: string): Promise<any> {
  try {
    return await import(module);
  } catch (error) {
    // Check if dist/ exists to provide better error message
    const distPath = resolve(process.cwd(), '../dist');
    if (!existsSync(distPath)) {
      throw new SetupError(
        step,
        `Module ${module} not found - ../dist/ directory missing. Build may have failed.`,
        error
      );
    }
    throw new SetupError(step, `Failed to import ${module}`, error);
  }
}

// ============================================================================
// Step Orchestration
// ============================================================================

interface SetupStep {
  name: string;
  run: () => Promise<void> | void;
  optional?: boolean;
  condition?: () => boolean;
}

class StepRunner {
  private steps: SetupStep[] = [];

  add(step: SetupStep): void {
    this.steps.push(step);
  }

  async execute(): Promise<void> {
    for (const step of this.steps) {
      // Check condition if provided
      if (step.condition && !step.condition()) {
        continue;
      }

      try {
        await step.run();
      } catch (error) {
        // SetupError is already formatted, just display it
        if (error instanceof SetupError) {
          console.error(`✗ ${error.message}`);
          if (error.cause && process.env.DEBUG) {
            console.error('Cause:', error.cause);
          }
          console.log('\n✗ Fail!');
          process.exit(1);
        }

        // For optional steps, allow failures
        if (step.optional) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`! ${step.name} skipped: ${message}`);
          continue;
        }

        // Non-optional step failed with unexpected error
        const message = error instanceof Error ? error.message : String(error);
        console.error(`✗ ${step.name} failed: ${message}`);
        console.log('\n✗ Fail!');
        process.exit(1);
      }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function runCommandQuiet(command: string, successMessage: string, stepName: string): void {
  try {
    // Run from server/ directory (two levels up from this script in shared/scripts/)
    const serverDir = resolve(process.cwd());
    execSync(command, { stdio: 'pipe', cwd: serverDir });
    if (successMessage) {
      console.log(successMessage);
    }
  } catch (error) {
    throw new SetupError(stepName, `Command failed: ${command}`, error);
  }
}

// ============================================================================
// Setup Functions
// ============================================================================

async function runNpmScripts(): Promise<void> {
  runCommandQuiet('npm install', '- Running npm scripts', 'npm-install');
  runCommandQuiet('npm run build', '', 'npm-build');
}

async function syncResources(): Promise<void> {
  const basePath = resolve(process.cwd(), env('MIDE_CONTENT_PATH', './content'));
  const databasePath = resolve(process.cwd(), env('MIDE_DB_PATH', './data/app.db'));

  // Initialize database
  const { initDatabase } = await safeImport(
    '../../server/dist/database/index.js',
    'resource-sync'
  );
  const db = await initDatabase({ path: databasePath });

  // Initialize Resource Manager
  const { ResourceManager } = await safeImport(
    '../../server/dist/src/index.js',
    'resource-sync'
  );
  const manager = await ResourceManager.init({
    database: db.connection,
    basePath,
  });

  // Sync all resources (content, projects, tool configs)
  const results = await manager.syncAll();

  // Log results
  const contentResult = results['content'];
  const projectsResult = results['projects'];
  const toolConfigsResult = results['tool-configs'];

  if (contentResult) {
    const total = contentResult.added + contentResult.updated;
    console.log(`- Content: +${contentResult.added} new, !${contentResult.updated} updated${contentResult.errors > 0 ? `, ✗${contentResult.errors} errors` : ''}`);
  }

  if (projectsResult) {
    console.log(`- Projects: +${projectsResult.added} discovered${projectsResult.errors > 0 ? `, ✗${projectsResult.errors} errors` : ''}`);
  }

  if (toolConfigsResult) {
    console.log(`- Tool Configs: +${toolConfigsResult.added} new, !${toolConfigsResult.updated} updated${toolConfigsResult.errors > 0 ? `, ✗${toolConfigsResult.errors} errors` : ''}`);
  }

  db.close();
}


// ============================================================================
// Main Setup
// ============================================================================

async function main(): Promise<void> {
  const platformName = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux';
  console.log(`Setting up midex for ${platformName} (${arch()})`);

  const runner = new StepRunner();

  runner.add({
    name: 'npm-scripts',
    run: runNpmScripts,
  });

  runner.add({
    name: 'resource-sync',
    run: syncResources,
  });

  await runner.execute();

  console.log('\n✓ Success!');
  process.exit(0);
}

main().catch((error) => {
  // This should rarely be hit since StepRunner handles SetupError
  // Only catches truly unexpected errors (e.g., syntax errors, unhandled rejections)
  console.error('✗ Unexpected error:', error instanceof Error ? error.message : String(error));
  if (process.env.DEBUG && error instanceof Error) {
    console.error('Stack:', error.stack);
  }
  console.log('\n✗ Fail!');
  process.exit(1);
});
