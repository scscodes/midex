# Contributing

## Basic Setup
> Note: `npm run setup` wraps `install`, `build` and `scripts/setup.ts`

> Breaking changes that impact `npm run setup` are **PROHIBITED**. Fix or roll back.

```bash
# Setup
npm run setup
# Unit test (Vitest)
npm run test
# Run
npm run start
```

## Database | Creating a new table
1. Create migration file
  touch src/core/database/migrations/002_add_my_table.ts

2. Write migration: src/core/database/README.md for detail

3. Run setup
```bash
  npm run setup  # Auto-discovers and applies

 # Output on setup:
  ✓ Applied 1 migration(s)

#  Or if destructive:
  ⚠ 1 migration(s) blocked (destructive changes require manual approval)
    - v2: drop_old_table (Destructive migration requires explicit approval)
```