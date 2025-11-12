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
    execSync(command, { stdio: 'pipe' });
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

async function discoverProjects(): Promise<void> {
  const { ProjectDiscovery } = await safeImport(
    '../../dist/core/project-discovery/index.js',
    'project-discovery'
  );
  const method = env('MIDE_DISCOVERY_METHOD', 'autodiscover');
  const options: { method: string; targetPath?: string } = { method };
  if (process.env.MIDE_PROJECT_PATH) {
    options.targetPath = process.env.MIDE_PROJECT_PATH;
  }

  const result = await ProjectDiscovery.discover(options);
  const methodLabel = method === 'autodiscover' ? 'autodiscovery' : 'manual';
  console.log(`- Projects: ${result.discovered} discovered (${result.valid} git repos) via ${methodLabel}`);
}

async function loadContent(backend: string, basePath: string, databasePath: string) {
  if (backend === 'database') {
    const { DatabaseBackend } = await safeImport(
      '../../dist/core/content-registry/lib/storage/database-backend.js',
      'content-load'
    );
    const dbBackend = await DatabaseBackend.create(databasePath);
    try {
      const [agents, rules, workflows] = await Promise.all([
        dbBackend.listAgents(),
        dbBackend.listRules(),
        dbBackend.listWorkflows(),
      ]);
      return { agents, rules, workflows };
    } catch (error) {
      throw new SetupError('content-load', 'Failed to load content from database', error);
    } finally {
      dbBackend.close();
    }
  } else {
    const { AgentFactory } = await safeImport(
      '../../dist/core/content-registry/agents/factory.js',
      'content-load'
    );
    const { RuleFactory } = await safeImport(
      '../../dist/core/content-registry/rules/factory.js',
      'content-load'
    );
    const { WorkflowFactory } = await safeImport(
      '../../dist/core/content-registry/workflows/factory.js',
      'content-load'
    );

    try {
      const [agents, rules, workflows] = await Promise.all([
        AgentFactory.list(basePath),
        RuleFactory.list(basePath),
        WorkflowFactory.list(basePath),
      ]);
      return { agents, rules, workflows };
    } catch (error) {
      throw new SetupError('content-load', 'Failed to load content from filesystem', error);
    }
  }
}

async function setupDatabase(databasePath: string, basePath: string): Promise<{ seeded: number }> {
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbExists = existsSync(databasePath);
  const shouldSeed = !dbExists || process.env.MIDE_SEED_DB === 'true';

  const { initDatabase } = await safeImport(
    '../../dist/core/database/index.js',
    'database-setup'
  );
  const db = await initDatabase({ path: databasePath });
  db.close();

  if (shouldSeed && existsSync(basePath)) {
    const { seedFromFilesystem } = await safeImport(
      '../../dist/core/content-registry/lib/sync/seeder.js',
      'database-setup'
    );
    const result = await seedFromFilesystem({ basePath, databasePath });
    const totalSeeded = result.agents.seeded + result.rules.seeded + result.workflows.seeded;
    return { seeded: totalSeeded };
  }

  return { seeded: 0 };
}

async function setupContentSystem(): Promise<void> {
  const contentBackend = env('MIDE_BACKEND', 'filesystem');
  if (contentBackend !== 'filesystem' && contentBackend !== 'database') {
    throw new SetupError(
      'content-system',
      `Invalid MIDE_BACKEND value: ${contentBackend}. Must be 'filesystem' or 'database'`
    );
  }

  const basePath = env('MIDE_CONTENT_PATH', './content');
  const databasePath = resolve(process.cwd(), env('MIDE_DB_PATH', '../shared/database/app.db'));

  const content = await loadContent(contentBackend, basePath, databasePath);
  const total = content.agents.length + content.rules.length + content.workflows.length;

  if (contentBackend === 'database') {
    const { seeded } = await setupDatabase(databasePath, basePath);
    const modeMsg = seeded > 0 ? `Database: seeded ${seeded} items` : 'Database: loaded';
    console.log(`- ${modeMsg} (${content.agents.length} agents, ${content.rules.length} rules, ${content.workflows.length} workflows - ${total} total)`);
  } else {
    console.log(`- Filesystem: loaded ${total} items (${content.agents.length} agents, ${content.rules.length} rules, ${content.workflows.length} workflows)`);
  }
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
    name: 'project-discovery',
    run: discoverProjects,
    optional: true,
  });

  runner.add({
    name: 'content-system',
    run: setupContentSystem,
  });

  await runner.execute();

  console.log('\n✓ Success!');
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
