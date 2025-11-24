# MiDeX Web Client

## Overview

The MiDeX web client is a **real-time monitoring and analytics dashboard** built with Next.js. It provides visibility into workflow execution, artifact management, and operational metrics for the MCP-based orchestration system.

## Purpose

The client serves three primary functions:

1. **Workflow Monitoring** - Track active workflows, step progression, and execution history
2. **Artifact Management** - View and search workflow outputs and generated documents
3. **Operational Intelligence** - Analyze efficiency, ROI, and system performance

## Key Features

### Real-Time Dashboard
- Active workflow count with live updates
- 24-hour completion metrics
- Failed workflow alerts
- Recent telemetry event stream
- Auto-refresh every 5 seconds

### Workflow Execution Tracking
- List all executions with filterable states
- Detailed execution timeline with step progression
- Step-level outputs and artifacts
- Agent assignment visibility
- Duration and status tracking

### Artifact Viewing
- Browse all workflow artifacts
- Markdown rendering with syntax highlighting
- Type-based filtering (design docs, code reviews, reports)
- Step-level artifact association
- Full-text search (powered by SQLite FTS5)

### Workflow Catalog
- Browse available workflow definitions
- View phases, steps, and agent assignments
- Complexity indicators
- Workflow descriptions and tags

### Efficiency & ROI Analytics
- Time savings calculations
- Workflow execution statistics
- Config management metrics
- Onboarding acceleration tracking
- Cost impact projections

### Security & Compliance
- Secrets protection tracking
- Config drift detection
- Audit readiness reports
- Compliance status dashboards

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS 4
- **Data Fetching**: SWR (stale-while-revalidate)
- **Database**: SQLite via better-sqlite3 (direct access)
- **Schema Validation**: Zod
- **Content Rendering**: react-markdown with GitHub Flavored Markdown

## Architecture

```
client/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard (real-time stats)
│   ├── api/                # API routes (server-side data access)
│   ├── artifacts/          # Artifact browsing and viewing
│   ├── executions/         # Workflow execution tracking
│   ├── workflows/          # Workflow catalog
│   ├── telemetry/          # Event stream viewer
│   ├── efficiency/         # Workflow efficiency metrics
│   ├── savings/            # ROI and cost savings
│   └── security/           # Security and compliance
├── components/             # Reusable React components
└── lib/                    # Shared utilities and types
```

## Database Access

The client **directly queries** the shared SQLite database at `shared/database/app.db`:

- **Read-only operations**: All client queries are read-only
- **No API server required**: Direct SQLite access via better-sqlite3
- **Same schema**: Uses identical database schema as MCP server
- **Real-time updates**: Polls database for live data

## Key Pages

### `/` - Dashboard
Real-time workflow monitoring with key metrics and recent events.

### `/executions` - Execution List
Filterable table of all workflow executions with state-based views.

### `/executions/[id]` - Execution Detail
Step-by-step timeline with outputs, artifacts, and telemetry.

### `/workflows` - Workflow Catalog
Browse available workflow definitions with phase breakdowns.

### `/artifacts` - Artifact Library
Search and view all workflow artifacts with type filtering.

### `/telemetry` - Event Stream
Live telemetry event viewer with type-based filtering.

### `/efficiency` - Workflow Efficiency
Time savings and execution statistics per workflow.

### `/savings` - ROI Dashboard
Cost impact, config management savings, and onboarding metrics.

### `/security` - Security & Compliance
Secrets protection, drift detection, and audit reports.

## Data Flow

```
User → Client Page → API Route → SQLite Database → Response → UI Update
                                      ↑
                                      └─── Shared with MCP Server
```

1. **User navigates** to a page
2. **Client component** calls API route (server-side)
3. **API route** queries SQLite database
4. **Database returns** result rows
5. **API route validates** with Zod schemas
6. **Client updates** UI with formatted data
7. **SWR re-fetches** periodically for real-time updates

## Running the Client

```bash
# Development mode (with hot reload)
npm run dev:client

# Production build
npm run build:client

# Start production server
npm run start:client
```

The client runs on **http://localhost:3000** by default.

## Environment Requirements

- **Database**: Requires `MIDEX_DB_PATH` to be set or uses default `./shared/database/app.db`
- **Node.js**: Requires Node.js 18+ for Next.js 15 features

## Implementation Details

For detailed implementation tracking, user stories, and acceptance criteria, see:

- **[Client Scenarios](../client/SCENARIOS.md)** - Complete use case documentation with implementation status
- **[Client Source Code](../client/)** - Full implementation in Next.js App Router

## Design Principles

1. **Server Components First**: Use React Server Components for data fetching
2. **Direct Database Access**: No intermediate API server needed
3. **Real-Time Updates**: Poll database every 3-5 seconds for live data
4. **Type Safety**: Zod validation for all database queries
5. **Responsive Design**: Tailwind CSS with mobile-first approach
6. **Progressive Enhancement**: Works without JavaScript for basic viewing

## Future Enhancements

- WebSocket support for push-based real-time updates
- User authentication and role-based access
- Workflow execution controls (pause, resume, cancel)
- Custom dashboard configurations
- Export functionality (PDF, CSV)
- Shareable dashboard links
- Dark mode support
