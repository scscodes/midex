# Tool Config Merge Strategy Analysis

## Current State

### What EXISTS:
```typescript
syncStrategy: {
  mode: 'readonly',              // Config option exists
  mergeStrategy: 'keep-both',    // Config option exists
  conflictResolution: 'keep-newest', // Config option exists
  createBackups: true            // Config option exists
}
```

### What's IMPLEMENTED:
- **Read-only sync**: Filesystem → Database (one-way)
- **Hash-based change detection**: Skip if hash matches
- **Upsert on conflict**: `ON CONFLICT(name) DO UPDATE`
- **NO bidirectional sync**: Database changes never written back
- **NO merge logic**: Config options are declared but unused
- **NO backup mechanism**: Despite `createBackups: true`

### Current Flow:
```
1. Extract from filesystem (project/user level)
2. Transform (redact secrets, generate metadata)
3. Load to database (upsert by name)
4. Hash comparison to detect changes
```

## Gap Analysis

### Critical Gaps:

1. **No Merge Implementation**
   - `mergeStrategy: 'keep-both'` is declared but never used
   - No logic to merge changes between database and filesystem
   - No conflict detection beyond hash comparison

2. **No Bidirectional Sync**
   - `mode: 'readonly'` is the only working mode
   - `mode: 'bidirectional'` would fail (no implementation)
   - Users can't push database changes back to files

3. **No Backup System**
   - `createBackups: true` has no implementation
   - Risky for destructive operations
   - No rollback mechanism

4. **Limited Conflict Resolution**
   - `conflictResolution: 'keep-newest'` uses timestamps only
   - No semantic merge (JSON object merging, array deduplication)
   - No manual conflict resolution UI

5. **No Diff Visualization**
   - Can't show what changed between versions
   - No tool to preview merge results
   - Hard to debug sync issues

### Logic Soundness Issues:

1. **Name Collision Risk**
   - Name format: `{tool}-{type}-{level}-{filename}-{hash8}`
   - If two projects have same file, names differ only by hash
   - Could lead to unexpected behavior with user/project conflicts

2. **Level Detection Ambiguity**
   - Falls back to home directory check: `filePath.startsWith(homeDir)`
   - Brittle: symlinks, bind mounts, unusual home dirs could break
   - No explicit `level` override during extraction (exists but unused)

3. **Metadata Inconsistency**
   - Metadata generated during transform (server_count, env_vars)
   - But never updated on subsequent syncs if content unchanged
   - Could be stale if JSON structure changes without content hash change

4. **Project Association**
   - `project_id` field exists but never populated by plugin
   - Foreign key to `project_associations` unused
   - Orphaned configs if project deleted

## Recommended Improvements

### Immediate (Fix Critical Issues):

1. **Add Project ID Association**
   ```typescript
   // In plugin.ts extract()
   const projectId = await this.findOrCreateProject(projectPath);
   extracted.projectId = projectId;
   ```

2. **Explicit Level Setting**
   ```typescript
   // In extractors, explicitly set level
   configs.forEach(c => c.level = 'project'); // or 'user'
   ```

3. **Populate Metadata on Updates**
   ```typescript
   // In load(), always regenerate metadata even if hash matches
   if (existing && existing.file_hash !== data.file_hash) {
     // Update metadata
   }
   ```

### Short-term (Basic Merge Support):

1. **Implement Keep-Both Strategy**
   ```typescript
   if (conflict && config.mergeStrategy === 'keep-both') {
     // Rename database version
     const dbCopy = { ...existing, name: `${existing.name}-db` };
     // Insert filesystem version as new row
   }
   ```

2. **Basic Backup System**
   ```typescript
   if (config.createBackups) {
     const backup = { ...existing, name: `${existing.name}-backup-${Date.now()}` };
     db.insert('tool_configs_backups', backup);
   }
   ```

3. **Semantic JSON Merge**
   ```typescript
   function mergeJsonConfigs(db: any, fs: any): any {
     // Deep merge for objects
     // Deduplicate arrays by key
     // Preserve user-specific vs project-specific
   }
   ```

### Long-term (Full Bidirectional Sync):

1. **Conflict Resolution UI**
   - Expose conflicts via MCP tool
   - Let user choose: keep-db, keep-fs, merge, manual-edit

2. **Bidirectional Mode**
   ```typescript
   if (config.syncStrategy.mode === 'bidirectional') {
     await this.writeback(changedConfigs);
   }
   ```

3. **Watch Mode**
   - Use `chokidar` to watch filesystem changes
   - Auto-sync on file modification
   - Debounce to avoid excessive syncs

4. **Diff Visualization**
   - Generate JSON diffs with `diff` library
   - Show side-by-side comparison
   - Highlight conflicts with line numbers

## Merge Strategy Proposals

### Option 1: Config File (.tool-config.json)
**Current → Next Step**

Extend existing `.tool-config.json` with detailed merge rules:

```json
{
  "syncStrategy": {
    "mode": "readonly",
    "mergeStrategy": "semantic-merge",
    "conflictResolution": "prompt-user",
    "createBackups": true,
    "backupRetention": 10
  },
  "mergeRules": {
    "mcp_servers": {
      "strategy": "merge-by-key",
      "conflictOn": "command",
      "preferLevel": "user"
    },
    "agent_rules": {
      "strategy": "keep-longest",
      "conflictOn": "hash"
    },
    "hooks": {
      "strategy": "merge-arrays",
      "deduplicateBy": "matcher"
    }
  }
}
```

**Pros:**
- Immediate, no UI needed
- Version-controlled with project
- Familiar pattern (like `.prettierrc`)

**Cons:**
- Manual editing required
- No validation until runtime
- Limited discoverability

### Option 2: Database-Stored Strategy
**Short Term**

Add `merge_strategies` table to store per-config rules:

```sql
CREATE TABLE merge_strategies (
  tool_type TEXT,
  config_type TEXT,
  strategy TEXT, -- 'keep-fs', 'keep-db', 'merge', 'prompt'
  rules JSON,    -- Strategy-specific rules
  PRIMARY KEY (tool_type, config_type)
);
```

**Pros:**
- Queryable via MCP tools
- Can evolve per-project
- Programmatic access

**Cons:**
- Not version-controlled
- Needs migration path
- Harder to share across projects

### Option 3: Web UI Settings Panel
**Long Term**

Add settings UI to midex web client:

```
Settings > Tool Configurations
├─ Sync Mode: [Readonly ▼]
├─ Merge Strategy: [Semantic Merge ▼]
└─ Per-Tool Rules:
   ├─ Claude Code
   │  ├─ MCP Servers: Merge by key ☑
   │  ├─ Hooks: Merge arrays ☑
   │  └─ Agent Rules: Keep longest ☑
   └─ Cursor
      └─ ...
```

**Pros:**
- User-friendly, no CLI needed
- Visual conflict resolution
- Real-time preview

**Cons:**
- Requires web client development
- Adds UI complexity
- Not automatable (CLI-first workflows)

## Recommended Path Forward

### Phase 1 (Immediate) - Stability & Validation
- Fix project ID association
- Add comprehensive tests (validation.test.ts)
- Improve level detection logic
- Document current behavior

### Phase 2 (Next Sprint) - Config-Driven Merge
- Implement basic merge strategies via `.tool-config.json`
- Add backup system
- Support semantic JSON merge for MCP servers
- Add conflict detection (but still manual resolution)

### Phase 3 (Long Term) - Full Bidirectional Sync
- Implement writeback to filesystem
- Add MCP tools for conflict resolution
- Watch mode for live sync
- Web UI settings panel (if web client exists)

## Testing Strategy

1. **Unit Tests** (validation.test.ts)
   - Each extractor against known configs
   - Schema validation for all config types
   - Edge cases (empty files, malformed JSON)

2. **Integration Tests**
   - Full sync cycle (extract → transform → load)
   - Conflict scenarios (hash mismatch, level collision)
   - Merge strategies (when implemented)

3. **E2E Tests**
   - Real projects with multiple tools
   - User + project level configs
   - Backup and rollback

## Metrics to Track

- **Sync Success Rate**: % of successful syncs vs failures
- **Conflict Frequency**: How often conflicts occur
- **Config Coverage**: % of known config files detected
- **Performance**: Time to sync per config type
