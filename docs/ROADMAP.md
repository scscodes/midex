# midex Roadmap

**Phase 1 (foundation)**: Complete ✅
**Phase 1.5 (workflow compilation)**: Complete ✅
**Phase 2 (workflow execution)**: Next - LLM integration pending

---

## Core Systems

### Content Registry

[`src/core/content-registry/README.md`](../src/core/content-registry/README.md)

**Current**:
- Dual-mode: filesystem or database
- Module-per-type: agents, rules, workflows
- Sync: filesystem → database seeding, optional bidirectional
- Operations: get, list, update (no create/delete - content managed via markdown files)
- Database backend: normalized tags, FTS5 search, audit logging, CHECK constraints
- Workflow structure:
  - Phase-based templates (design-time: WHAT and WHO)
  - Standardized frontmatter with `phases` array and `complexity` field
  - 9 workflows standardized with dependency-based parallelism
  - Phases stored as JSON in database
- Separation of concerns: templates (content) vs execution policies (config)

**Future**:
- Expose FTS5 search API
- CRUD operations if needed for programmatic content generation
- Agent constraint loading integration with WorkflowCompiler

---

### Project Discovery

[`src/core/project-discovery/README.md`](../src/core/project-discovery/README.md)

**Current**:
- Autodiscovery (scan parent for neighbor projects) and manual mode
- Git repo detection, OS-agnostic paths

**Future**:
- Stable for Phase 2
- Future: multi-project coordination, caching, change detection

---

### Workflow Orchestrator

[`src/core/workflow-orchestrator/README.md`](../src/core/workflow-orchestrator/README.md)

**Current**:
- Framework: contracts, schemas, 4-layer model defined
- WorkflowCompiler: transforms templates → executable workflows
  - Infers execution mode (parallel/sequential) from dependency graph
  - Applies execution policies based on complexity
  - Generates agent tasks from phase descriptions
- Execution policies: retry, parallelism, timeout by complexity (simple/moderate/high)
- State management: in-memory workflow state tracking
- Execution boundary: validation, timeout, telemetry at each layer
- Ready for Phase 2: orchestrator loads templates, compiles, executes (pending LLM integration)

**Future** (Phase 2):
- Agent execution interface + LLM integration strategy
- Implement actual agent invocation (currently stub)
- Policy overrides and runtime configuration
- Compiled workflow caching (optional optimization)
- Goal: execute simple workflow end-to-end with real LLM agents

---

### Database

[`src/core/database/README.md`](../src/core/database/README.md)

**Current**:
- SQLite with auto-migrations (6 applied)
- WAL mode, prepared statement caching, transactions
- Normalized tags, FTS5, audit logging, CHECK constraints
- Workflow schema: complexity + phases columns (migration 006)

**Future**:
- Stable for Phase 2
- Future: migration rollback tooling, optimization utilities

---

### Agent System

**Current**: Not implemented (deferred until workflow execution patterns understood)

**Future**:
- Will be defined during Phase 2
- Future: registry, lifecycle, coordination, telemetry

---

### Build & Tooling

**Current**:
- TypeScript 5.7+ strict, Vitest (51 tests)
- Scripts: setup, clean, auto-clean before build

**Future**:
- Stable for Phase 2
- Future: build verification, pre-commit hooks, CI/CD

---

## Recent Updates (Phase 1.5)

**Workflow Compilation System** - Completed
- ✅ Standardized all 9 workflow files with phase-based structure
- ✅ Implemented WorkflowCompiler for template → executable transformation
- ✅ Added execution policies (retry, parallelism, timeout) by complexity
- ✅ Database migration 006: added complexity + phases columns
- ✅ Dependency-based parallelism inference from workflow graph
- ✅ Separation: content (templates) vs config (policies) vs runtime (compilation)
- ✅ All 51 tests passing

**Architecture Pattern**:
```
Workflow Template (markdown) → WorkflowCompiler → ExecutableWorkflow → Orchestrator
```

---

## Known Limitations

- Workflow execution: pending LLM integration for agent invocation
- Content CRUD: no create/delete (by design - content managed via markdown)
- Search API: FTS5 in DB but not exposed
- Agent system: not implemented (deferred to Phase 2)

## Technical Debt

1. ~~Build artifacts~~ - fixed
2. ~~Setup script paths~~ - fixed
3. Build verification checks
4. More unit tests (currently 51 integration tests)
