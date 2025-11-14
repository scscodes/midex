# Zod Validation Opportunities

Areas in the codebase that should be using Zod validation but currently don't.

## 🔴 High Priority

### 1. **Project Association Database Queries**
**File:** `src/lib/project-association.ts`

**Issues:**
- Lines 67, 79, 176: Database queries use `as any` without validation
- Line 190: Manual `JSON.parse(row.metadata)` without validation
- Line 176: `listProjects()` returns unvalidated rows

**Should Use:**
- `ProjectAssociationRowSchema` from `utils/database-schemas.ts`
- `validateDatabaseRow()` for all queries

**Example Fix:**
```typescript
// Current (line 67)
const row = stmt.get(path) as any;
return row ? this.mapRow(row) : null;

// Should be
const row = stmt.get(path);
if (!row) return null;
const validatedRow = validateDatabaseRow(ProjectAssociationRowSchema, row as Record<string, unknown>);
return this.mapRow(validatedRow);
```

---

### 2. **Tool Config Plugin Configuration Loading**
**File:** `src/plugins/tool-configs/plugin.ts`

**Issues:**
- Line 64: `JSON.parse(readFileSync(configPath, 'utf-8'))` - No validation
- Configuration file structure not validated
- Could fail silently or cause runtime errors

**Should Use:**
- Create `PluginConfigSchema` in `schemas/tool-config-schemas.ts`
- Validate loaded config against schema

**Example Fix:**
```typescript
// Current (line 64)
return JSON.parse(readFileSync(configPath, 'utf-8'));

// Should be
const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
return PluginConfigSchema.parse(raw);
```

---

### 3. **Tool Config Transformer JSON Parsing**
**File:** `src/plugins/tool-configs/transformer.ts`

**Issues:**
- Lines 45, 53: `JSON.parse(extracted.content)` for mcp_servers and hooks configs
- No validation of parsed JSON structure
- Try/catch swallows errors silently

**Should Use:**
- Create schemas for MCP server config structure
- Create schemas for hooks config structure
- Validate parsed configs before use

**Example Fix:**
```typescript
// Current (line 45)
const config = JSON.parse(extracted.content);
metadata.server_count = Object.keys(config.mcpServers || {}).length;

// Should be
const raw = JSON.parse(extracted.content);
const config = McpServersConfigSchema.parse(raw);
metadata.server_count = Object.keys(config.mcpServers || {}).length;
```

---

### 4. **MCP Tool Parameter Input Validation**
**Files:**
- `mcp/tools/content-provider.ts`
- `mcp/tools/query-tools.ts`
- `mcp/tools/lifecycle-tools.ts`
- `mcp/tools/logging-tools.ts`

**Issues:**
- No validation of tool parameter objects
- No bounds checking on pagination (page, limit, offset)
- No enum validation (complexity, severity, state, etc.)
- No type coercion for numeric inputs

**Should Use:**
- Create Zod schemas for all tool parameter interfaces
- Validate at tool entry points

**Example Schemas Needed:**
```typescript
// For content-provider.ts
export const SearchWorkflowsParamsSchema = z.object({
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  complexity: z.enum(['simple', 'moderate', 'high']).optional(),
  detailLevel: z.enum(['name', 'summary', 'full']).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

// For lifecycle-tools.ts
export const StartExecutionParamsSchema = z.object({
  workflowName: z.string().min(1).max(200),
  projectPath: z.string().optional(),
  projectId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});
```

---

## 🟡 Medium Priority

### 5. **Content Provider Manual JSON Parsing**
**File:** `mcp/tools/content-provider.ts`

**Issues:**
- Lines 264, 272: Manual `JSON.parse(rule.tags)` and `JSON.parse(rule.globs)`
- These come from validated database rows, but then parsed again manually
- Should use validated row types directly

**Should Use:**
- Use `RuleRow` type from validated database rows
- Tags and globs are already parsed and validated by `RuleRowSchema`

**Example Fix:**
```typescript
// Current (line 264)
const ruleTags = rule.tags ? JSON.parse(rule.tags) : [];

// Should be
// rule.tags is already parsed by RuleRowSchema (string[] | null)
const ruleTags = rule.tags || [];
```

**Note:** This requires updating the `Rule` interface in content-provider.ts to match `RuleRow` type.

---

### 6. **Orchestrator Workflow Loading**
**File:** `mcp/orchestrator/index.ts`

**Issues:**
- Line 153: Uses `as any` for workflow query result
- Line 164: Manual `JSON.parse(result.tags)` - should use validated row
- Line 165: Uses deprecated `complexity_hint` instead of `complexity`

**Should Use:**
- Use `WorkflowRowSchema` and validated row type
- Tags already parsed by schema

**Example Fix:**
```typescript
// Current (line 153)
const result = await manager.get<any>('workflow', name);

// Should be
const result = await manager.get<WorkflowRow>('workflow', name);
// result.tags is already string[] | null from validated schema
```

---

### 7. **Package.json Parsing**
**File:** `src/lib/project-association.ts`

**Issues:**
- Line 140: Uses `require()` to load package.json - no validation
- No schema for package.json structure
- Could fail or return unexpected structure

**Should Use:**
- Create `PackageJsonSchema` (or use existing from a library)
- Validate parsed package.json

**Example Fix:**
```typescript
// Current (line 140)
const packageJson = require(packageJsonPath);
metadata.packageName = packageJson.name;

// Should be
const raw = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const packageJson = PackageJsonSchema.parse(raw);
metadata.packageName = packageJson.name;
```

---

## 🟢 Low Priority

### 8. **Shared JSON Utilities**
**Status:** Already identified in ANALYSIS.md

**Should Create:**
- `server/utils/json.ts` with validation-aware parsing
- `safeParseJSON<T>(json: string, schema?: ZodSchema<T>): T | null`
- `safeStringifyJSON(value: unknown): string | null`

**Benefits:**
- Centralized error handling
- Consistent null/undefined handling
- Optional schema validation

---

### 9. **Plugin Transform Validation**
**Files:**
- `src/plugins/tool-configs/transformer.ts` - No explicit validation
- `src/plugins/projects.ts` - No explicit validation

**Should Use:**
- Ensure all plugins validate transformed data
- Use consistent validation pattern

---

## Summary

### High Priority (4 items)
1. ✅ Project Association database queries
2. ✅ Tool Config plugin config loading
3. ✅ Tool Config transformer JSON parsing
4. ✅ MCP tool parameter input validation

### Medium Priority (3 items)
5. Content Provider manual JSON parsing
6. Orchestrator workflow loading
7. Package.json parsing

### Low Priority (2 items)
8. Shared JSON utilities
9. Plugin transform validation

---

## Implementation Order

1. **Immediate**: Fix project-association.ts database queries (uses existing schema)
2. **Short-term**: Add MCP tool parameter validation (high impact, prevents bugs)
3. **Short-term**: Add config file validation (tool-configs plugin)
4. **Medium-term**: Fix manual JSON parsing in content-provider and orchestrator
5. **Long-term**: Extract JSON utilities, standardize plugin validation

---

## Files to Create/Update

### New Schemas Needed
- `schemas/tool-config-schemas.ts` - Add `PluginConfigSchema`
- `schemas/tool-config-schemas.ts` - Add `McpServersConfigSchema`, `HooksConfigSchema`
- `schemas/mcp-tool-params.ts` - All MCP tool parameter schemas
- `schemas/package-json.ts` - Package.json schema (or use library)

### Files to Update
- `src/lib/project-association.ts` - Add validation
- `src/plugins/tool-configs/plugin.ts` - Add config validation
- `src/plugins/tool-configs/transformer.ts` - Add JSON validation
- `mcp/tools/*.ts` - Add input parameter validation
- `mcp/tools/content-provider.ts` - Fix manual JSON parsing
- `mcp/orchestrator/index.ts` - Fix workflow loading

