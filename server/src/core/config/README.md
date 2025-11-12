# Core Config

Global configuration for execution contexts across midex.

## Execution Policies

Execution policies define retry, parallelism, and timeout behavior for execution contexts (workflows, agents, or other operations). Policies are selected based on complexity level (`simple`, `moderate`, `high`).

### Policy Structure

- **Retry Policy**: Maximum attempts, backoff delay, escalation behavior
- **Parallelism**: Maximum concurrent operations, fail-fast behavior
- **Timeout**: Per-step/operation timeout, total execution timeout

### Usage

```typescript
import { getExecutionPolicy } from '../config';

const policy = getExecutionPolicy('moderate');
// Use policy.retryPolicy, policy.parallelism, policy.timeout
```

### Design Principles

- **Global standard**: Policies apply to any execution context, not just workflows
- **Complexity-based**: Simple operations get minimal retry/timeout, complex operations get more
- **Configurable**: Policies can be overridden at runtime for specific contexts

