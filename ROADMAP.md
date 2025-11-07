# midex Roadmap

## Current Status (v0.1.0)

midex has reached a stable foundation with:
- ✅ Dual-mode content registry (filesystem + database)
- ✅ 4-layer workflow orchestrator with contract validation
- ✅ Database infrastructure with 7 migrations
- ✅ Project discovery and association tracking
- ✅ Complete MCP server with 23 tools
- ✅ Execution lifecycle management
- ✅ Finding and artifact storage
- ✅ Full test coverage (66+ tests passing)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server (stdio)                        │
│                  23 Tools for AI Model Access                    │
└────────────┬────────────────────────────────────────────────────┘
             │
   ┌─────────▼─────────┐
   │  Content Provider │
   │  (6 tools)        │
   └─────────┬─────────┘
             │
   ┌─────────▼───────────────────────────────────────────────────┐
   │                    Content Registry                          │
   │  ┌──────────────┐         ┌──────────────┐                  │
   │  │  Filesystem  │ ◄────► │   Database   │                  │
   │  │   Backend    │  Sync  │   Backend    │                  │
   │  └──────────────┘         └──────────────┘                  │
   │         │                        │                           │
   │    .mide-lite/              SQLite (app.db)                  │
   │   - agents/                - agents, rules, workflows       │
   │   - rules/                 - normalized tags                │
   │   - workflows/             - FTS5 search                    │
   │   - contracts/             - audit logs                     │
   └────────────────────────────┬────────────────────────────────┘
                                │
   ┌────────────────────────────▼────────────────────────────────┐
   │              Workflow Lifecycle Manager                      │
   │  ┌────────────────────────────────────────────────┐         │
   │  │ Lifecycle Tools (8 tools)                      │         │
   │  │  - Start/transition/complete execution         │         │
   │  │  - Step dependencies, timeout detection        │         │
   │  │  - Cross-session resumption                    │         │
   │  └───────────────────┬────────────────────────────┘         │
   │                      │                                       │
   │  ┌───────────────────▼────────────────────────────┐         │
   │  │ Database Tables (migration 007)                │         │
   │  │  - workflow_executions                         │         │
   │  │  - workflow_steps (with depends_on)            │         │
   │  │  - execution_logs (idempotent)                 │         │
   │  │  - artifacts (immutable)                       │         │
   │  │  - findings (FTS5 search)                      │         │
   │  │  - project_associations                        │         │
   │  └────────────────────────────────────────────────┘         │
   └─────────────────────────────────────────────────────────────┘
             │                            │
   ┌─────────▼─────────┐        ┌────────▼─────────┐
   │  Logging Tools    │        │   Query Tools    │
   │  (3 tools)        │        │   (3 tools)      │
   │  - log_execution  │        │  - query_findings│
   │  - store_artifact │        │  - get_history   │
   │  - store_finding  │        │  - get_details   │
   └───────────────────┘        └──────────────────┘
             │
   ┌─────────▼─────────────────────────────────────────┐
   │        Project Discovery & Association             │
   │  - Autodiscover neighbor projects                  │
   │  - Manual path validation                          │
   │  - Git repository detection                        │
   │  - Track project usage across sessions             │
   └────────────────────────────────────────────────────┘
```

## Core Systems

### 1. Content Registry
**Status:** ✅ Complete
**Location:** `src/core/content-registry/`

**Current:**
- Dual-mode storage (filesystem + database)
- Bidirectional sync with conflict resolution
- Module-per-type architecture (agents, rules, workflows)
- Zod schema validation
- SHA-256 hash-based change detection
- FTS5 full-text search
- Normalized tags
- Audit logging

**Planned:**
- Content versioning (v0.2.0)
- Content templates (v0.3.0)
- Workflow composition from reusable fragments (v0.3.0)
- Agent persona inheritance (v0.4.0)

### 2. Workflow Orchestrator
**Status:** 🚧 Planned
**Location:** `src/core/workflow-orchestrator/`

**Current:**
- Architecture defined in README
- Contract schemas in place
- Configuration constants defined

**Planned:**
- Layer 1: Orchestrator implementation (v0.2.0)
- Layer 2: Workflow executor (v0.2.0)
- Layer 3: Step executor (v0.2.0)
- Layer 4: Agent task executor (v0.2.0)
- Retry and escalation logic (v0.2.0)
- Telemetry integration with MCP logging (v0.2.0)
- Integration tests (v0.2.0)

### 3. Database Infrastructure
**Status:** ✅ Complete
**Location:** `src/core/database/`

**Current (7 migrations):**
- 001: Initial content schema (agents, rules, workflows)
- 002: Normalized tags
- 003: CHECK constraints
- 004: FTS5 full-text search
- 005: Audit logging
- 006: Workflow phases and compiler
- 007: Execution lifecycle tables

**Planned:**
- 008: Workflow orchestrator state tables (v0.2.0)
- 009: Telemetry and metrics tables (v0.3.0)
- 010: Agent invocation history (v0.3.0)

### 4. Project Discovery
**Status:** ✅ Complete
**Location:** `src/core/project-discovery/`

**Current:**
- Autodiscovery (parent directory scan)
- Manual path validation
- Git repository detection
- Project association tracking (migration 007)

**Planned:**
- Monorepo awareness (detect workspaces) (v0.2.0)
- Package.json metadata extraction enhancement (v0.2.0)
- Project relationship mapping (v0.3.0)

### 5. MCP Server
**Status:** ✅ Complete
**Location:** `src/mcp/`

**Current (23 tools):**
- Content Provider (6 tools)
- Lifecycle Tools (8 tools)
- Logging Tools (3 tools)
- Query Tools (3 tools)
- Stdio transport
- Auto-initialization
- Graceful shutdown

**Planned:**
- Tool usage metrics (v0.2.0)
- Rate limiting and quotas (v0.3.0)
- Tool composition (workflows from tool sequences) (v0.3.0)
- Streaming responses for long-running operations (v0.4.0)

## Feature Roadmap

### v0.2.0 - Workflow Orchestrator (Q2 2025)
**Focus:** Complete workflow execution engine

- [ ] Implement WorkflowOrchestrator (Layer 1)
- [ ] Implement WorkflowExecutor (Layer 2)
- [ ] Implement StepExecutor (Layer 3)
- [ ] Implement AgentTaskExecutor (Layer 4)
- [ ] Retry and escalation logic
- [ ] Telemetry integration
- [ ] Database migration 008 (orchestrator state tables)
- [ ] Integration tests for all layers
- [ ] End-to-end workflow execution tests
- [ ] MCP tool for workflow execution (`execute_workflow`)
- [ ] Monorepo awareness for project discovery

### v0.3.0 - Advanced Features (Q3 2025)
**Focus:** Content composition and agent enhancements

- [ ] Content versioning system
- [ ] Workflow composition from fragments
- [ ] Content templates for agents/rules/workflows
- [ ] Agent persona inheritance
- [ ] Database migration 009 (telemetry tables)
- [ ] Database migration 010 (agent invocation history)
- [ ] Tool composition for complex workflows
- [ ] Rate limiting and quotas for MCP tools
- [ ] Project relationship mapping
- [ ] Enhanced metrics and analytics

### v0.4.0 - UI and Real-time Features (Q4 2025)
**Focus:** Web interface and real-time monitoring

- [ ] Web interface for workflow monitoring
- [ ] Real-time telemetry dashboard
- [ ] WebSocket support for streaming
- [ ] Streaming MCP responses for long operations
- [ ] Agent persona visual editor
- [ ] Workflow visual designer
- [ ] Finding aggregation dashboard
- [ ] Project analytics and insights

### v1.0.0 - Production Ready (Q1 2026)
**Focus:** Stability, performance, and documentation

- [ ] Production-grade error handling
- [ ] Performance optimizations
- [ ] Comprehensive documentation
- [ ] API stability guarantees
- [ ] Migration guides
- [ ] Best practices guide
- [ ] Example workflows library
- [ ] Security audit
- [ ] Load testing
- [ ] Multi-user support preparation

## Architecture Evolution

### Phase 1: Foundation (✅ Complete)
- Core infrastructure (content registry, database, project discovery)
- MCP server integration
- Execution lifecycle tracking

### Phase 2: Execution (v0.2.0)
- Complete workflow orchestrator
- End-to-end workflow execution
- Contract validation at all layers

### Phase 3: Enhancement (v0.3.0)
- Content composition
- Advanced agent features
- Tool composition
- Analytics

### Phase 4: Production (v0.4.0 - v1.0.0)
- Web interface
- Real-time features
- Performance optimization
- Production hardening

## Integration Points

### Current Integrations
- ✅ MCP clients (via stdio transport)
- ✅ SQLite database
- ✅ Filesystem content
- ✅ JSON Schema validation (Ajv)
- ✅ Zod schema validation

### Planned Integrations
- 🚧 Agent runtimes (Claude Code, custom agents) (v0.2.0)
- 🚧 CI/CD pipelines (workflow triggers) (v0.3.0)
- 🚧 WebSocket servers (real-time updates) (v0.4.0)
- 🚧 Authentication providers (multi-user) (v1.0.0)

## Performance Targets

### Current Performance
- SQLite with WAL mode, 64MB cache
- Prepared statement caching
- FTS5 for full-text search
- Indexed tag lookups
- Efficient sync with hash comparison

### Planned Improvements
- Query optimization (v0.2.0)
- Connection pooling (v0.3.0)
- Caching layer (v0.3.0)
- Parallel execution support (v0.4.0)
- Database sharding for scale (v1.0.0)

## Migration Strategy

### Breaking Changes Policy
- No breaking changes before v1.0.0
- Database migrations always forward-compatible
- Content format versioning for backward compatibility
- Deprecation warnings minimum 1 minor version

### Upgrade Path
- Auto-migration system for database
- Content format validators
- Migration guides for each version
- Rollback support for migrations

## Community and Ecosystem

### Planned Resources
- Example workflows repository (v0.3.0)
- Agent persona marketplace (v0.4.0)
- Rule library (v0.4.0)
- Documentation site (v0.4.0)
- Discord community (v1.0.0)

## License and Governance
- MIT License
- Community-driven development
- RFC process for major features (starting v0.3.0)
