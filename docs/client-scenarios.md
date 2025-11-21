# Midex Client Scenarios & Use Cases

This document defines all scenarios the web client will address. Use it for:
- Implementation tracking (checkbox status)
- Marketing/showcase material
- Stakeholder communication

---

## Core Telemetry Scenarios

### 1. Dashboard Overview
**Status:** [ ] Not Started

**User Story:** As a user, I want to see a summary of all workflow activity at a glance.

**Displays:**
- Active workflows count (state = 'running')
- Recent completions (last 24h)
- Failed workflows requiring attention
- Event rate (events/minute)

**API:** `GET /api/stats`

**Acceptance Criteria:**
- [ ] Shows real-time active workflow count
- [ ] Shows completion count for last 24h
- [ ] Shows failed count with visual indicator
- [ ] Auto-refreshes every 5 seconds

---

### 2. Live Event Stream
**Status:** [ ] Not Started

**User Story:** As a user, I want to watch telemetry events in real-time as workflows execute.

**Displays:**
- Scrolling event list (newest first)
- Event type badges (color-coded)
- Timestamp, execution_id, step_name
- Expandable metadata JSON
- Filter by event_type

**API:** `GET /api/telemetry?limit=100&event_type={filter}&since={iso}`

**Acceptance Criteria:**
- [ ] Shows events in reverse chronological order
- [ ] Color-coded badges per event type
- [ ] Click to expand metadata
- [ ] Filter dropdown for event types
- [ ] Auto-refresh every 3 seconds
- [ ] "since" parameter prevents duplicate fetches

---

### 3. Execution List
**Status:** [ ] Not Started

**User Story:** As a user, I want to see all workflow executions and their current state.

**Displays:**
- Sortable table: execution_id, workflow_name, state, started_at, duration
- State badges (running=blue, completed=green, failed=red)
- Click row to view detail

**API:** `GET /api/executions?state={filter}&limit=50`

**Acceptance Criteria:**
- [ ] Table with sortable columns
- [ ] State filter dropdown
- [ ] Clickable rows navigate to detail
- [ ] Pagination or infinite scroll
- [ ] Shows relative time ("2 minutes ago")

---

### 4. Execution Detail + Timeline
**Status:** [ ] Not Started

**User Story:** As a user, I want to see the complete history of a specific workflow execution.

**Displays:**
- Header: execution_id, workflow_name, state, duration
- Step timeline (vertical): Each step with status, agent, duration
- Step detail: Output summary, artifacts
- Telemetry events for this execution

**APIs:**
- `GET /api/executions/{id}`
- `GET /api/executions/{id}/steps`
- `GET /api/telemetry?execution_id={id}`

**Acceptance Criteria:**
- [ ] Visual timeline showing step progression
- [ ] Current step highlighted if running
- [ ] Click step to expand output/artifacts
- [ ] Related telemetry events shown
- [ ] Failed step shows error details

---

### 5. Workflow Catalog
**Status:** [ ] Not Started

**User Story:** As a user, I want to browse available workflow definitions.

**Displays:**
- Card grid: workflow name, description, complexity, phase count
- Click card to view phases and agent assignments

**API:** `GET /api/workflows`

**Acceptance Criteria:**
- [ ] Grid/list of available workflows
- [ ] Complexity indicator (simple/moderate/high)
- [ ] Phase count shown
- [ ] Click to see full definition with phases

---

## Savings & ROI Scenarios

### 6. Configuration Savings Dashboard
**Status:** [ ] Not Started

**User Story:** As a team lead, I want to see the tangible impact of centralized configuration on my team's efficiency.

**Displays:**
```
┌────────────────────────────────────────────────────────┐
│  SAVINGS DASHBOARD                                      │
├──────────────────┬─────────────────────────────────────┤
│  Files Managed   │  47 configs across 12 projects      │
│  Sync Events     │  234 auto-syncs this month          │
│  Drift Prevented │  18 would-be inconsistencies        │
│  Time Saved      │  ~32 hours/month ($4,800/mo*)       │
│  Risk Reduced    │  0 secrets leaked to source control │
└──────────────────┴─────────────────────────────────────┘
```

**API:** `GET /api/stats/savings`

**Acceptance Criteria:**
- [ ] Shows files managed count
- [ ] Shows sync event count (configurable time range)
- [ ] Shows drift prevention count
- [ ] Calculates time saved based on configurable hourly rate
- [ ] Shows secrets leak prevention status

---

### 7. File Proliferation Analysis
**Status:** [ ] Not Started

**User Story:** As a developer, I want to see how midex reduces config file sprawl across my projects.

**The Problem (Before midex):**
```
project-a/.eslintrc.json    (version A)
project-b/.eslintrc.json    (version B - drifted!)
project-c/.eslintrc.js      (different format!)
```

**The Solution (With midex):**
```
midex registry → single source of truth
projects subscribe → always in sync
```

**Displays:**
- Before/after file count comparison
- Config consistency score (% in sync)
- Last sync timestamp per project
- Alert for stale syncs

**API:** `GET /api/projects/sync-status`

**Acceptance Criteria:**
- [ ] Visual before/after comparison
- [ ] Consistency percentage score
- [ ] Per-project sync status
- [ ] Alerts for projects >24h since sync

---

### 8. Drift Detection & Prevention
**Status:** [ ] Not Started

**User Story:** As a DevOps engineer, I want to ensure all projects stay aligned with organizational standards.

**Displays:**
- Drift timeline: When configs diverged
- Affected projects list
- One-click resync option
- Drift prevention rules

**Comparison Table:**
| Scenario | Without midex | With midex |
|----------|--------------|------------|
| Dev modifies config | Persists silently | Detected & flagged |
| New rule added | Manual 15-repo update | Auto-sync all |
| Outdated config | Found in audit | Real-time alert |

**API:** `GET /api/drift/status`

**Acceptance Criteria:**
- [ ] Shows drift events with timestamps
- [ ] Lists affected projects
- [ ] One-click resync action
- [ ] Configurable drift rules

---

### 9. Secrets & Sensitive Data Protection
**Status:** [ ] Not Started

**User Story:** As a security-conscious team, I want to ensure credentials never leak to source control.

**The Risk:**
```
commit abc123: "oops, removed API key"
commit def456: "added .env to gitignore"
commit ghi789: "initial commit with .env" ← STILL IN HISTORY
```

**Displays:**
- Secrets inventory (names only, not values)
- Access log: who/when/which project
- Expiration warnings
- Compliance status

**Savings Table:**
| Incident Type | Industry Avg Cost | midex Prevention |
|--------------|-------------------|------------------|
| API key leak | $50K-500K+ | Never in source |
| Credential rotation | 4-8 hrs downtime | Instant |
| Security audit prep | 40+ hours | Instant reports |

**API:** `GET /api/secrets/audit`

**Acceptance Criteria:**
- [ ] Lists managed secrets (names only)
- [ ] Shows access history
- [ ] Expiration date warnings
- [ ] Compliance report export

---

### 10. Cross-Project Standardization
**Status:** [ ] Not Started

**User Story:** As an engineering manager, I want consistent tooling across all team projects.

**Value Calculation:**
```
Traditional: 14+ hours setup + ongoing maintenance
midex: 2.5 hours setup + zero maintenance
```

**Displays:**
- Organization config catalog
- Project subscription matrix
- Compliance heatmap
- One-click "apply to new project"

**API:** `GET /api/configs/catalog`

**Acceptance Criteria:**
- [ ] Shows all org-level configs
- [ ] Matrix of which projects use which configs
- [ ] Visual heatmap (green=compliant)
- [ ] "Apply to project" action

---

### 11. Onboarding Acceleration
**Status:** [ ] Not Started

**User Story:** As a new team member, I want to get productive immediately without config setup.

**Comparison:**
| Activity | Traditional | With midex |
|----------|-------------|------------|
| Initial setup | 4-8 hours | 15 minutes |
| Config debugging | 2-4 hours | 0 |
| Total per hire | 7-14 hours | 15 minutes |
| At 10 hires/year | $10K-21K | $375 |

**Displays:**
- Onboarding checklist status
- Time-to-first-commit metric
- Setup completion percentage
- Common blockers (if any)

**API:** `GET /api/stats/onboarding`

**Acceptance Criteria:**
- [ ] Shows average onboarding time
- [ ] Shows time-to-first-commit
- [ ] Tracks setup completion rate
- [ ] Identifies common blockers

---

### 12. Workflow Efficiency Tracking
**Status:** [ ] Not Started

**User Story:** As a user, I want to see how automated workflows save me time.

**Example:**
```
Workflow: security-threat-assessment
├── Manual equivalent: 6-8 hours
├── Automated time: 45 minutes
├── Executions this month: 12
└── Time saved: ~84 hours ($12,600)
```

**Displays:**
- Workflows executed (time range)
- Average completion time
- Manual equivalent estimate
- Time saved calculation

**API:** `GET /api/stats/workflow-efficiency`

**Acceptance Criteria:**
- [ ] Per-workflow execution count
- [ ] Average/median completion time
- [ ] Configurable manual-equivalent estimate
- [ ] Calculated savings in hours and dollars

---

### 13. ROI Summary Report
**Status:** [ ] Not Started

**User Story:** As a decision-maker, I want to see the business case for midex at a glance.

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│  MIDEX ROI SUMMARY                                          │
├─────────────────────────────────────────────────────────────┤
│  TIME SAVINGS                                               │
│  ├── Config management:        32 hrs/mo                    │
│  ├── Onboarding (8 hires):     96 hrs                       │
│  ├── Workflow automation:      84 hrs/mo                    │
│  └── Drift remediation:        16 hrs/mo                    │
│      TOTAL:                    228 hrs/month                │
│                                                             │
│  COST IMPACT (@ $150/hr)                                    │
│  ├── Monthly savings:          $34,200                      │
│  ├── Annual projection:        $410,400                     │
│  └── midex cost:               $0 (self-hosted)             │
│      NET ANNUAL VALUE:         $410,400                     │
│                                                             │
│  RISK REDUCTION                                             │
│  ├── Secrets in source:        0 incidents                  │
│  ├── Config drift:             100% compliance              │
│  └── Audit readiness:          Instant                      │
└─────────────────────────────────────────────────────────────┘
```

**API:** `GET /api/stats/roi`

**Acceptance Criteria:**
- [ ] Aggregates all savings metrics
- [ ] Configurable hourly rate
- [ ] Monthly and annual projections
- [ ] Export to PDF/CSV
- [ ] Shareable link

---

## Implementation Phases

### Phase 1: Foundation (Scenarios 1-4)
- [ ] Database connection (read-only)
- [ ] API routes: telemetry, executions, workflows
- [ ] Dashboard page (Scenario 1)
- [ ] Live event stream (Scenario 2)
- [ ] Execution list (Scenario 3)
- [ ] Execution detail (Scenario 4)

### Phase 2: Reference & Tracking (Scenarios 5, 12)
- [ ] Workflow catalog (Scenario 5)
- [ ] Workflow efficiency tracking (Scenario 12)

### Phase 3: Savings Dashboard (Scenarios 6, 7, 8)
- [ ] Savings dashboard (Scenario 6)
- [ ] File proliferation analysis (Scenario 7)
- [ ] Drift detection (Scenario 8)

### Phase 4: Security & Compliance (Scenario 9)
- [ ] Secrets protection view (Scenario 9)

### Phase 5: Organization Views (Scenarios 10, 11)
- [ ] Cross-project standardization (Scenario 10)
- [ ] Onboarding metrics (Scenario 11)

### Phase 6: Executive Reporting (Scenario 13)
- [ ] ROI summary report (Scenario 13)
- [ ] Export functionality
- [ ] Shareable dashboards

---

## Marketing Value Props

**For Individual Developers:**
> "Stop wasting hours on config setup. midex syncs your tools once, everywhere."

**For Team Leads:**
> "One config, every project, every dev. No more drift, no more 'works on my machine.'"

**For Engineering Managers:**
> "Cut onboarding time by 90%. See compliance instantly. Zero secrets in git."

**For Security Teams:**
> "Credentials never touch source control. Full audit trail. Instant rotation."

**For Executives:**
> "400+ hours saved annually. $400K+ value. Zero infrastructure cost."

---

## Technical Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | Next.js 15 (App Router) | Already in project |
| Data Fetching | API routes + SWR | Simple, caching |
| Database | better-sqlite3 (read-only) | Fast, already available |
| Styling | Tailwind CSS | Rapid development |
| Charts | Recharts | Lightweight, React-native |
| State | React hooks + SWR | No Redux needed |

---

*Last Updated: 2024-11-21*
