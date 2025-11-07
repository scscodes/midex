# Project Discovery & Reconciliation

System for discovering and validating projects via autodiscovery or user-supplied paths.

## Usage

### Autodiscovery (Default)

Scans parent directory for neighbor projects:

```typescript
import { ProjectDiscovery } from '@/core/project-discovery';

const result = await ProjectDiscovery.discover({ method: 'autodiscover' });

console.log(`Discovered ${result.discovered} projects`);
console.log(`${result.valid} are git repositories`);

for (const project of result.projects) {
  console.log(`${project.name}: ${project.path} (git: ${project.isGitRepository})`);
}
```

### Manual Discovery

Discover from a specific directory:

```typescript
const result = await ProjectDiscovery.discover({
  method: 'manual',
  targetPath: '/path/to/projects'
});

// Includes the target directory and any subdirectories
```

### Validation

Check if a path is a valid git repository:

```typescript
const isValid = ProjectDiscovery.validateProject('/path/to/project');
```

## Discovery Methods

### Autodiscover

1. Resolves current working directory's parent
2. Scans parent directory for subdirectories
3. Excludes current directory
4. Detects `.git` directories for validation
5. Returns all discovered projects

**Example:** If running from `/projects/midex/`, scans `/projects/` for neighbors.

### Manual

1. Validates supplied path exists and is a directory
2. Checks if target directory is a git repository
3. Optionally scans subdirectories for projects
4. Returns discovered projects including the target

## Project Association Management

midex includes a **ProjectAssociationManager** for tracking discovered projects across sessions.

### Usage

```typescript
import { ProjectAssociationManager } from '@/core/project-discovery/project-association';
import { initDatabase } from '@/core/database';

const db = await initDatabase();
const projectManager = new ProjectAssociationManager(db.connection);

// Auto-detect and create project association from current directory
const project = projectManager.associateProject();

console.log(`Associated project: ${project.name}`);
console.log(`Path: ${project.path}`);
console.log(`Git repo: ${project.isGitRepo}`);
console.log(`Metadata: ${JSON.stringify(project.metadata)}`);

// Associate from a specific path
const otherProject = projectManager.associateProject('/path/to/project');

// List all projects
const projects = projectManager.listProjects({ limit: 50, offset: 0 });

// Get project by path
const existing = projectManager.getProjectByPath('/path/to/project');

// Get project by ID
const byId = projectManager.getProjectById(1);
```

### Features

- **Auto-detection:** Uses `process.cwd()` by default
- **Manual path:** Override with specific directory
- **Metadata extraction:** Reads `package.json` when available
- **Git validation:** Checks for `.git` directory
- **Usage tracking:** Updates `last_used_at` on access
- **Idempotent:** Reuses existing project records

### Database Schema

Project associations are stored in the `project_associations` table (migration 007):

```sql
CREATE TABLE project_associations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  path TEXT UNIQUE NOT NULL,
  is_git_repo INTEGER DEFAULT 0,
  metadata TEXT,  -- JSON
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### MCP Integration

The MCP server uses `ProjectAssociationManager` for auto-project association:

```typescript
// In MCP server (src/mcp/server.ts)
case 'start_execution':
  // Auto-associate project if projectPath provided
  if ((args as any).projectPath && !(args as any).projectId) {
    const project = projectManager.associateProject((args as any).projectPath);
    (args as any).projectId = project.id;
  }
  result = await lifecycleTools.startExecution(args as any);
  break;
```

This enables:
- Automatic project tracking when workflows start
- Project-specific finding scoping
- Cross-project execution history
- Project-based analytics

## Key Files

- `index.ts` - Main ProjectDiscovery class
- `project-association.ts` - ProjectAssociationManager class
- `internal/path.ts` - OS-agnostic path utilities
- `internal/git.ts` - Git repository detection
- `types.ts` - Type definitions
- `errors.ts` - Error classes

## Rules & Constraints

- **OS-Agnostic**: All paths normalized for cross-platform compatibility
- **Git Detection**: Checks for `.git` directory or file (worktrees)
- **Path Validation**: Ensures paths exist and are directories
- **No Recursion**: Autodiscovery only scans immediate parent, not recursive
- **Current Directory Exclusion**: Autodiscovery excludes current directory

## Example Scenarios

### Scenario 1: Autodiscovery in Workspace

```
/projects/
├── midex/          (current)
├── project-a/      (discovered, has .git)
├── project-b/      (discovered, has .git)
└── temp/           (discovered, no .git)
```

Result: 3 projects discovered, 2 valid (git repositories)

### Scenario 2: Manual Discovery

```
/path/to/projects/
├── .git            (target is git repo)
├── subproject-a/   (discovered, has .git)
└── subproject-b/   (discovered, no .git)
```

Result: 3 projects discovered, 2 valid

