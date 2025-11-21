// Shared types for client application

// Valid workflow execution states (from DB CHECK constraint)
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'abandoned' | 'diverged';

// Valid step statuses (from DB CHECK constraint)
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

// Database row types (as returned from SQLite)
export interface TelemetryEventRow {
  id: number;
  event_type: string;
  execution_id: string | null;
  step_name: string | null;
  agent_name: string | null;
  metadata: string | null;
  created_at: string;
}

export interface ExecutionRow {
  execution_id: string;
  workflow_name: string;
  state: ExecutionState;
  current_step: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  metadata: string | null;
}

export interface ExecutionStepRow {
  id: number;
  execution_id: string;
  step_name: string;
  agent_name: string;
  status: StepStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  output: string | null;
  token: string | null;
}

export interface WorkflowRow {
  name: string;
  description: string;
  tags: string;
  complexity: string;
  phases: string;
  definition?: string;
  manual_equivalent_minutes?: number;
}

// API response types
export interface Stats {
  activeWorkflows: number;
  completedLast24h: number;
  failedWorkflows: number;
  eventsLastHour: number;
}

export interface WorkflowStats {
  total: number;
  completed: number;
  failed: number;
  avgDuration: number;
  manualEquivalent: number;
}

export interface WorkflowEfficiency {
  name: string;
  description: string;
  total: number;
  completed: number;
  avgDuration: number;
  manualEquivalent: number;
  savedHours: number;
  savedDollars: number;
}

export interface SavingsData {
  filesManaged: number;
  projectsManaged: number;
  syncEvents: number;
  driftPrevented: number;
  secretsProtected: number;
  hoursSaved: number;
  lastSync: string | null;
  driftEvents: DriftEvent[];
  projectSyncStatus: ProjectSync[];
}

export interface DriftEvent {
  id: string;
  project: string;
  file: string;
  detected_at: string;
  status: 'detected' | 'resolved';
}

export interface ProjectSync {
  name: string;
  lastSync: string;
  configCount: number;
  status: 'synced' | 'stale' | 'drifted';
}

export interface SecretInfo {
  name: string;
  project: string;
  lastAccess: string;
  expiresAt: string | null;
  accessCount: number;
}

export interface AccessLog {
  id: string;
  secret: string;
  project: string;
  action: string;
  timestamp: string;
  user: string;
}

export interface SecurityData {
  secrets: SecretInfo[];
  accessLogs: AccessLog[];
  stats: {
    totalSecrets: number;
    expiringIn7Days: number;
    accessesLast24h: number;
    leakIncidents: number;
  };
}

// Parsed workflow phase structure
export interface ParsedPhase {
  name: string;
  agent: string;
  steps?: string[];
}
