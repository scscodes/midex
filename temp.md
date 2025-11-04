From recent claude session:   Next Steps (Future Phases)

  When ready for Phase 2-4, you can add:
  - CHECK constraints matching Zod schemas
  - Normalized tag tables (better query performance)
  - Full-text search
  - Audit logging
  - Query builder/typed queries

  But the foundation is now solid - schema evolution is safe, automatic, and developer-friendly!

> move forward with the next steps: check constrains w zod, normalized tag tables, full-text search, and audit logging - but do not work on the query builder/typed 
queries yet. ensure the docs/**.md and src/core/database/README.md remain fully up to date. no legacy, no garbage. 

● Write(src/core/database/migrations/002_normalize_tags.ts)
  ⎿  Wrote 128 lines to src/core/database/migrations/002_normalize_tags.ts
     import type { Migration } from './types';
     /**
      * Normalize tag storage from JSON columns to relational tables
      *
      * Benefits:
      * - Efficient indexing for tag queries
      * - Foreign key constraints ensure referential integrity
      * - Better query performance (no JSON parsing)
      * - Supports tag-based filtering without full table scans
     … +118 lines (ctrl+o to expand)
  ⎿  Session limit reached ∙ resets 7pm
     /upgrade to increase your usage limit.

  Todos
  ☐ Create migration for normalized tag tables
  ☐ Create migration for CHECK constraints
  ☐ Create migration for full-text search
  ☐ Create migration for audit logging
  ☐ Update database backend for normalized tags
  ☐ Add full-text search methods
  ☐ Update all documentation
  ☐ Test all migrations and features
  ☐ Clean up legacy code and docs