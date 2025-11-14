# Tool Configuration Plugin

Discovers and manages AI coding tool configurations across multiple editors and IDEs.

## Supported Tools

| Tool | Version | Config Types | Project Level | User Level |
|------|---------|--------------|---------------|------------|
| **Claude Code** | CLI | MCP, Hooks, Commands, Rules | ✅ | ✅ |
| **Cursor** | Latest | MCP, Settings, Rules | ✅ | ✅ |
| **Windsurf** | Latest | MCP, Rules, Ignore | ✅ | ✅ |
| **VS Code** | 1.102+ | MCP, Copilot Instructions, Settings | ✅ | ✅ |
| **IntelliJ** | Junie Plugin | MCP | ✅ | ❌ |

## Configuration Files

### Claude Code (CLI)

**Project Level:**
- `.mcp.json` → MCP server configurations
- `.claude/settings.json` → Hooks configuration
- `.claude/settings.local.json` → Local hooks (overrides, git-ignored)
- `.claude/commands/*.md` → Slash command definitions
- `CLAUDE.md` → Project-wide agent instructions

**User Level:**
- `~/.claude/settings.json` → Global hooks

**References:**
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)

---

### Cursor

**Project Level:**
- `.cursor/mcp.json` → MCP server configurations
- `.cursor/settings.json` → Cursor-specific settings
- `.cursor/rules/*.mdc` → Organized agent rules (one file per topic)
- `.cursorrules` → Legacy single-file rules (deprecated pattern)

**User Level:**
- Windows: `%APPDATA%\Cursor\User\mcp.json`
- macOS: `~/Library/Application Support/Cursor/User/mcp.json`
- Linux: `~/.config/Cursor/User/mcp.json`

**References:**
- [Cursor Documentation](https://docs.cursor.com)

---

### Windsurf (Codeium)

**Project Level:**
- `.windsurf/mcp.json` → Project-level MCP servers
- `.windsurf/rules/*.md` → Multiple rule files (organizational pattern)
- `.windsurfrules` → Root-level rules (alternative to directory)
- `.codeiumignore` → Cascade AI ignore patterns (gitignore syntax)

**User Level:**
- `~/.codeium/windsurf/mcp_config.json` → Global MCP servers
- `~/.codeium/.codeiumignore` → Global ignore patterns

**References:**
- [Windsurf Documentation](https://docs.codeium.com/windsurf)
- [Cascade MCP Integration](https://docs.codeium.com/windsurf/mcp)

---

### VS Code (with Copilot)

**Project Level:**
- `.github/copilot-instructions.md` → Primary Copilot instructions (GA Feb 2025)
- `*.instructions.md` → Language/framework-specific instructions (anywhere in project)
- `.vscode/settings.json` → MCP servers and Copilot settings

**User Level:**
- Windows: `%APPDATA%\Code\User\settings.json`
- macOS: `~/Library/Application Support/Code/User/settings.json`
- Linux: `~/.config/Code/User/settings.json`

**Important Notes:**
- Copilot instructions require `github.copilot.chat.codeGeneration.useInstructionFiles: true`
- Cross-platform: Same `.github/copilot-instructions.md` works in VS Code, Visual Studio, GitHub.com
- Recursive search for `*.instructions.md` files (skips hidden dirs and node_modules)

**References:**
- [Custom Instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Copilot Settings Reference](https://code.visualstudio.com/docs/copilot/reference/copilot-settings)

---

### IntelliJ (Junie AI)

**Project Level:**
- `.junie/mcp/mcp.json` → MCP server configurations (if Junie plugin installed)

**User Level:**
- Not supported (GUI-driven, complex XML structure)

**References:**
- IntelliJ plugin ecosystem (no official Junie public docs)

---

## Official Sources Consulted

All configuration patterns derived from official documentation:

1. **VS Code Copilot** (Feb 2025 GA)
   - Source: https://code.visualstudio.com/docs/copilot/customization/custom-instructions
   - Patterns: `.github/copilot-instructions.md`, `*.instructions.md`
   - Setting: `github.copilot.chat.codeGeneration.useInstructionFiles`

2. **Windsurf**
   - Source: https://docs.codeium.com/windsurf
   - Patterns: `.codeiumignore` (project + user level)
   - Syntax: Follows gitignore patterns

3. **Cursor**
   - Source: https://docs.cursor.com
   - Patterns: `.cursor/rules/*.mdc`, `.cursor/settings.json`

4. **Claude Code**
   - Source: https://docs.claude.com/en/docs/claude-code
   - Patterns: `.claude/commands/*.md`, `.claude/settings.json`

## Configuration Types

### `mcp_servers`
MCP (Model Context Protocol) server definitions following the MCP specification.

**Schema:**
```typescript
{
  mcpServers: {
    [serverName: string]: {
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
      type?: 'stdio' | 'http'
      url?: string           // For HTTP servers
      serverUrl?: string     // Alternative to 'url'
      headers?: Record<string, string>  // For HTTP auth
    }
  }
}
```

### `agent_rules`
Freeform markdown instructions for AI assistants. Includes:
- Copilot instructions (`.github/copilot-instructions.md`, `*.instructions.md`)
- Cursor rules (`.cursor/rules/*.mdc`, `.cursorrules`)
- Windsurf rules (`.windsurf/rules/*.md`, `.windsurfrules`)
- Claude Code rules (`CLAUDE.md`)

### `hooks`
Lifecycle hooks for Claude Code (pre/post tool execution).

**Schema:**
```typescript
{
  hooks: {
    [eventName: string]: Array<{
      matcher?: string
      hooks: Array<{
        type: 'command' | 'prompt'
        command?: string
        timeout?: number  // 1-600 seconds
        prompt?: string
      }>
    }>
  }
}
```

### `settings`
Tool-specific configuration files:
- Claude Code slash commands (`.claude/commands/*.md`)
- Cursor settings (`.cursor/settings.json`)
- Windsurf ignore patterns (`.codeiumignore`)
- VS Code Copilot settings (`.vscode/settings.json` with `github.copilot.*`)

## Security

### Secret Redaction

All extracted configs undergo secret redaction based on patterns defined in `.tool-config.json`:

**Default Patterns:**
- `API_KEY`
- `TOKEN`
- `PASSWORD`
- `SECRET`
- `BEARER`

**Example:**
```json
// Before redaction
{ "GITHUB_TOKEN": "ghp_abc123..." }

// After redaction
{ "GITHUB_TOKEN": "[REDACTED_TOKEN]" }
```

### Ignore Patterns

Windsurf `.codeiumignore` files control what Cascade AI can access:
```
# .codeiumignore example
*.log
node_modules/
.env
secrets/
```

## Plugin Configuration

Runtime behavior controlled via `server/.tool-config.json`:

```json
{
  "enabled": true,
  "syncStrategy": {
    "mode": "readonly",
    "mergeStrategy": "keep-both",
    "conflictResolution": "keep-newest",
    "createBackups": true
  },
  "discovery": {
    "projectLevel": true,
    "userLevel": false,
    "followSymlinks": false
  },
  "extraction": {
    "tools": {
      "claude-code": { "enabled": true, "priority": 1 },
      "cursor": { "enabled": true, "priority": 2 },
      "windsurf": { "enabled": true, "priority": 3 },
      "vscode": { "enabled": true, "priority": 4 },
      "intellij": { "enabled": true, "priority": 5 }
    },
    "configTypes": {
      "mcp_servers": true,
      "agent_rules": true,
      "hooks": true,
      "settings": true
    }
  },
  "security": {
    "redactSecrets": true,
    "secretPatterns": ["API_KEY", "TOKEN", "PASSWORD", "SECRET", "BEARER"]
  }
}
```

## Architecture

```
tool-configs/
├── plugin.ts           # Main orchestrator
├── transformer.ts      # Config transformation + secret redaction
├── utils.ts            # Shared utilities (path detection, tool detection)
├── types.ts            # TypeScript type definitions
├── extractors/         # Tool-specific extractors
│   ├── claude-code.ts  # Claude Code CLI
│   ├── cursor.ts       # Cursor IDE
│   ├── windsurf.ts     # Windsurf (Codeium)
│   ├── vscode.ts       # VS Code + Copilot
│   └── intellij.ts     # IntelliJ (Junie)
└── __tests__/
    └── validation.test.ts  # Comprehensive test suite
```

## Database Schema

Tool configs stored in `tool_configs` table:

```sql
CREATE TABLE tool_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  tool_type TEXT NOT NULL,              -- 'claude-code', 'cursor', etc.
  config_type TEXT NOT NULL,            -- 'mcp_servers', 'agent_rules', etc.
  config_level TEXT NOT NULL,           -- 'project', 'user'
  content TEXT NOT NULL,                -- File contents (redacted if secrets)
  file_path TEXT,                       -- Original file path
  project_id INTEGER,                   -- FK to project_associations
  metadata TEXT,                        -- JSON: server_count, env_vars, etc.
  file_hash TEXT,                       -- SHA-256 for change detection
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE CASCADE
);
```

## Testing

Run validation tests:

```bash
npm test -- src/plugins/tool-configs/__tests__/validation.test.ts
```

**Coverage:**
- All 5 extractors with real config examples
- Schema validation (MCP servers, hooks)
- Edge cases (invalid JSON, missing files, legacy formats)
- Priority handling (settings.local.json > settings.json)
- Recursive search (*.instructions.md)
- Multi-file rules (Windsurf, Cursor)

## Performance

- **Hash-based change detection**: Skips unchanged files (SHA-256 comparison)
- **Incremental sync**: Only updates modified configs
- **Project association**: Links configs to projects for cleanup on project deletion
- **Parallel extraction**: Multiple tools can be extracted concurrently

## Future Enhancements

See [MERGE_ANALYSIS.md](./MERGE_ANALYSIS.md) for detailed roadmap:

**Phase 2 (Next Sprint):**
- Config-driven merge strategies
- Backup system for destructive operations
- Semantic JSON merge for MCP servers

**Phase 3 (Long-term):**
- Bidirectional sync (database → filesystem)
- Filesystem watch mode (real-time sync)
- Web UI for conflict resolution

## FAQ

**Q: Why are some configs extracted as `settings` instead of dedicated types?**

A: We use `settings` for tool-specific configs that don't fit standard categories:
- Claude Code slash commands (custom per-project)
- Cursor tool settings (UI preferences, etc.)
- Windsurf ignore patterns (security/privacy)
- VS Code Copilot settings (when no MCP present)

**Q: How does priority work for multiple tools?**

A: Priority (1-5) determines extraction order. Lower numbers = higher priority. Claude Code extracts first, IntelliJ last.

**Q: What happens if a config file is invalid JSON?**

A: Invalid JSON is silently skipped. The extractor continues processing other files. Check logs for errors.

**Q: Can I disable specific config types?**

A: Yes! Edit `server/.tool-config.json` and set `configTypes.{type}: false`. For example:
```json
{ "configTypes": { "hooks": false } }  // Disable hook extraction
```

**Q: Why aren't extension-specific configs supported?**

A: We focus on official, broadly-applicable patterns from tool vendors. Extension configs are too fragmented and undocumented.
