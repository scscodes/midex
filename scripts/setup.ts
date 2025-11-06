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

// Helper: Execute command with error handling
function runCommand(command: string, successMessage: string, errorMessage: string): void {
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(successMessage);
  } catch {
    console.error(errorMessage);
    process.exit(1);
  }
}

// Helper: Get environment variable with default
function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

// Helper: Load content via ContentRegistry (works for both modes)
async function loadContent(backend: string, basePath: string, databasePath: string) {
  try {
    if (backend === 'database') {
      // For database mode, use DatabaseBackend directly to ensure proper cleanup
      const { DatabaseBackend } = await import('../dist/core/content-registry/lib/storage/database-backend.js');
      const dbBackend = new DatabaseBackend(databasePath);
      try {
        const [agents, rules, workflows] = await Promise.all([
          dbBackend.listAgents().catch(() => []),
          dbBackend.listRules().catch(() => []),
          dbBackend.listWorkflows().catch(() => []),
        ]);
        return { agents, rules, workflows };
      } finally {
        dbBackend.close();
      }
    } else {
      // For filesystem mode, use factories directly
      const { AgentFactory } = await import('../dist/core/content-registry/agents/factory.js');
      const { RuleFactory } = await import('../dist/core/content-registry/rules/factory.js');
      const { WorkflowFactory } = await import('../dist/core/content-registry/workflows/factory.js');

      const [agents, rules, workflows] = await Promise.all([
        AgentFactory.list(basePath).catch(() => []),
        RuleFactory.list(basePath).catch(() => []),
        WorkflowFactory.list(basePath).catch(() => []),
      ]);

      return { agents, rules, workflows };
    }
  } catch {
    return { agents: [], rules: [], workflows: [] };
  }
}

// Helper: Setup database
async function setupDatabase(databasePath: string, basePath: string): Promise<{ seeded: number }> {
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbExists = existsSync(databasePath);
  const shouldSeed = !dbExists || process.env.MIDE_SEED_DB === 'true';

  // Initialize database (migrations run automatically)
  const { initDatabase } = await import('../dist/core/database/index.js');
  const db = initDatabase({ path: databasePath });
  db.close();

  // Seed if needed
  if (shouldSeed && existsSync(basePath)) {
    const { seedFromFilesystem } = await import('../dist/core/content-registry/lib/sync/seeder.js');
    const result = await seedFromFilesystem({ basePath, databasePath });
    const totalSeeded = result.agents.seeded + result.rules.seeded + result.workflows.seeded;
    return { seeded: totalSeeded };
  }

  return { seeded: 0 };
}

// Main setup
console.log('🚀 Setting up midex...\n');

// Step 1: Platform Detection
const platformName = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux';
console.log(`🖥️  Platform: ${platformName} (${arch()})`);

// Step 2: Install dependencies
runCommand('npm install', '📦 Dependencies installed', '❌ Failed to install dependencies');

// Step 3: Build
runCommand('npm run build', '🔨 Build complete', '❌ Build failed');

// Step 4: Project Discovery
try {
  const { ProjectDiscovery } = await import('../dist/core/project-discovery/index.js');
  const method = env('MIDE_DISCOVERY_METHOD', 'autodiscover');
  const options: any = { method };
  if (process.env.MIDE_PROJECT_PATH) options.targetPath = process.env.MIDE_PROJECT_PATH;

  const result = await ProjectDiscovery.discover(options);
  const methodLabel = method === 'autodiscover' ? 'autodiscovery' : 'manual';
  console.log(`🔍 Projects: ${result.discovered} discovered (${result.valid} git repos) via ${methodLabel}`);
} catch (error: any) {
  console.log(`🔍 Project discovery skipped: ${error.message || error}`);
}

// Step 5: Content System
const contentBackend = env('MIDE_BACKEND', 'filesystem');
const basePath = env('MIDE_CONTENT_PATH', '.mide-lite');
const databasePath = resolve(process.cwd(), env('MIDE_DB_PATH', './data/app.db'));

if (contentBackend === 'database') {
  try {
    const { seeded } = await setupDatabase(databasePath, basePath);
    const message = seeded > 0 ? `Database seeded (${seeded} items)` : 'Database mode';
    console.log(`📚 Content system: ${message}`);
  } catch {
    console.error('❌ Database setup failed');
    process.exit(1);
  }
} else {
  console.log('📚 Content system: Filesystem mode');
}

// Step 6: Content State
const content = await loadContent(contentBackend, basePath, databasePath);
const total = content.agents.length + content.rules.length + content.workflows.length;
console.log(`📊 Content: ${content.agents.length} agents, ${content.rules.length} rules, ${content.workflows.length} workflows (${total} total)`);

console.log('\n✨ Setup complete!');
