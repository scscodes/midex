/**
 * Content schema - defines tables for agents, rules, and workflows
 */

export const contentSchema = `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT, -- JSON array
  version TEXT,
  path TEXT,
  file_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  globs TEXT, -- JSON array
  always_apply INTEGER DEFAULT 0, -- boolean
  tags TEXT, -- JSON array
  path TEXT,
  file_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT, -- JSON array
  triggers TEXT, -- JSON object
  complexity_hint TEXT,
  path TEXT,
  file_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_tags ON agents(tags);
CREATE INDEX IF NOT EXISTS idx_rules_tags ON rules(tags);
CREATE INDEX IF NOT EXISTS idx_rules_always_apply ON rules(always_apply);
CREATE INDEX IF NOT EXISTS idx_workflows_tags ON workflows(tags);
`;


