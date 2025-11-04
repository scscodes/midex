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

## Key Files

- `index.ts` - Main ProjectDiscovery class
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

