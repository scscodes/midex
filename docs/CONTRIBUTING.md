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

## Architecture Patterns

### Execution Policy Pattern

**Use execution policies for timeout/retry/parallelism, not hardcoded config.**

```typescript
// ✅ Correct: Use execution policy
import { getExecutionPolicy } from '@/core/config/execution-policies';

const policy = getExecutionPolicy(workflow.complexity);
await executeWithTimeout(fn, policy.timeout.perStepMs);

// ❌ Wrong: Hardcoded global config
await executeWithTimeout(fn, Config.defaultTimeout);
```

**Why:**
- **Single source of truth**: `src/core/config/execution-policies.ts`
- **Complexity-aware**: Simple workflows get short timeouts, complex get long
- **No config drift**: One definition prevents conflicting settings
- **Explicit dependencies**: Pass as parameters, not globals

**Policy values by complexity:**
- Simple: 5min/step, 15min total, 1 retry, 2 concurrent
- Moderate: 10min/step, 1hr total, 2 retries, 4 concurrent
- High: 30min/step, 2hr total, 3 retries, 6 concurrent

**References:**
- Implementation: [`src/core/config/execution-policies.ts`](../src/core/config/execution-policies.ts)
- Example: [`src/core/workflow-orchestrator/`](../src/core/workflow-orchestrator/)
- Documentation: [`docs/README.md#execution-policies`](./README.md#execution-policies)

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