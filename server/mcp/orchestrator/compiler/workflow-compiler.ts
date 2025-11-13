/**
 * WorkflowCompiler - Transforms workflow templates into executable workflows
 *
 * Separates design-time concerns (template structure) from runtime concerns (execution policy).
 * Templates define WHAT and WHO, compiler adds HOW (retry, parallelism, timeout).
 */

import type { Workflow, WorkflowPhase, StepDefinition, AgentTaskDefinition } from '../types.js';
import type { ExecutionPolicy } from '../../../utils/execution-policies.js';
import { getExecutionPolicy } from '../../../utils/execution-policies.js';

/**
 * Executable workflow - compiled from template + policy
 */
export interface ExecutableWorkflow {
  name: string;
  description: string;
  complexity: 'simple' | 'moderate' | 'high';
  steps: StepDefinition[];
  policy: ExecutionPolicy;
  metadata: {
    templateHash?: string;
    compiledAt: Date;
  };
}

/**
 * Compiler options
 */
export interface CompilerOptions {
  /**
   * Override default execution policy for this workflow
   */
  policyOverride?: Partial<ExecutionPolicy>;

  /**
   * Load agent constraints from content registry
   */
  loadAgentConstraints?: (agentName: string) => Promise<string[]>;
}

/**
 * WorkflowCompiler - Compiles workflow templates into executable workflows
 *
 * Responsibilities:
 * - Load workflow template from content registry
 * - Apply execution policy based on complexity
 * - Infer execution mode (sequential/parallel) from dependency graph
 * - Generate agent tasks from phase descriptions
 * - Produce ExecutableWorkflow for orchestrator
 *
 * Design principles:
 * - Templates are declarative (WHAT and WHO)
 * - Compiler adds imperative details (HOW)
 * - Execution policy is configuration, not content
 * - Dependency graph determines parallelism
 */
export class WorkflowCompiler {
  constructor(private options: CompilerOptions = {}) {}

  /**
   * Compile a workflow template into an executable workflow
   */
  async compile(workflow: Workflow): Promise<ExecutableWorkflow> {
    // 1. Get base execution policy from complexity level
    const basePolicy = getExecutionPolicy(workflow.complexity);

    // 2. Apply any policy overrides
    const policy: ExecutionPolicy = this.options.policyOverride
      ? this.mergePolicy(basePolicy, this.options.policyOverride)
      : basePolicy;

    // 3. Build dependency graph and determine execution order
    const phaseGraph = this.buildDependencyGraph(workflow.phases);

    // 4. Compile phases into executable steps
    const steps: StepDefinition[] = [];
    for (const phase of workflow.phases) {
      const step = await this.compilePhase(phase, phaseGraph);
      steps.push(step);
    }

    // 5. Return executable workflow
    return {
      name: workflow.name,
      description: workflow.description,
      complexity: workflow.complexity,
      steps,
      policy,
      metadata: {
        templateHash: workflow.fileHash,
        compiledAt: new Date(),
      },
    };
  }

  /**
   * Compile a single phase into an executable step
   */
  private async compilePhase(
    phase: WorkflowPhase,
    graph: DependencyGraph
  ): Promise<StepDefinition> {
    // Determine execution mode based on dependency graph
    const mode = this.inferExecutionMode(phase, graph);

    // Generate agent tasks for this phase
    const tasks = await this.generateTasks(phase);

    // Apply retry policy from execution policy
    // (This will be set at runtime by orchestrator based on policy)
    return {
      name: phase.phase,
      agent: phase.agent,
      mode,
      tasks,
      // retry: policy.retryPolicy, // Applied by orchestrator at runtime
    };
  }

  /**
   * Infer execution mode from dependency graph
   *
   * Rules:
   * - If phase has no dependencies → can run parallel with other phases that have no dependencies
   * - If phase depends on other phases → runs sequentially after dependencies
   * - If phase.allowParallel === false → always sequential
   */
  private inferExecutionMode(
    phase: WorkflowPhase,
    graph: DependencyGraph
  ): 'sequential' | 'parallel' | 'conditional' {
    // If explicitly marked as non-parallel, force sequential
    if (phase.allowParallel === false) {
      return 'sequential';
    }

    // Find phases with same dependencies (siblings in execution graph)
    const siblings = graph.phasesByDependency.get(this.getDependencyKey(phase.dependsOn)) || [];

    // If there are multiple phases with same dependencies, they can run in parallel
    // (we already checked allowParallel !== false above)
    if (siblings.length > 1) {
      return 'parallel';
    }

    // Default to sequential execution
    return 'sequential';
  }

  /**
   * Generate agent tasks from phase description
   *
   * For now, creates a single task per phase.
   * Future: could parse phase description to generate multiple sub-tasks.
   */
  private async generateTasks(phase: WorkflowPhase): Promise<AgentTaskDefinition[]> {
    // Load agent constraints if loader provided
    const constraints = this.options.loadAgentConstraints
      ? await this.options.loadAgentConstraints(phase.agent)
      : [];

    return [
      {
        name: phase.phase,
        agent: phase.agent,
        task: phase.description,
        constraints,
      },
    ];
  }

  /**
   * Build dependency graph for workflow phases
   */
  private buildDependencyGraph(phases: WorkflowPhase[]): DependencyGraph {
    const phasesByDependency = new Map<string, WorkflowPhase[]>();

    for (const phase of phases) {
      const key = this.getDependencyKey(phase.dependsOn);
      const existing = phasesByDependency.get(key) || [];
      existing.push(phase);
      phasesByDependency.set(key, existing);
    }

    return {
      phasesByDependency,
      phases,
    };
  }

  /**
   * Generate dependency key for grouping phases
   */
  private getDependencyKey(dependencies: string[]): string {
    return dependencies.sort().join(',') || '__root__';
  }

  /**
   * Merge policy override into base policy
   */
  private mergePolicy(base: ExecutionPolicy, override: Partial<ExecutionPolicy>): ExecutionPolicy {
    return {
      retryPolicy: {
        ...base.retryPolicy,
        ...(override.retryPolicy || {}),
      },
      parallelism: {
        ...base.parallelism,
        ...(override.parallelism || {}),
      },
      timeout: {
        ...base.timeout,
        ...(override.timeout || {}),
      },
    };
  }
}

/**
 * Dependency graph for workflow phases
 */
interface DependencyGraph {
  phasesByDependency: Map<string, WorkflowPhase[]>;
  phases: WorkflowPhase[];
}

/**
 * Helper function to compile workflow from template
 */
export async function compileWorkflow(
  workflow: Workflow,
  options?: CompilerOptions
): Promise<ExecutableWorkflow> {
  const compiler = new WorkflowCompiler(options);
  return compiler.compile(workflow);
}
