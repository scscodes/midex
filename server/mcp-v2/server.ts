#!/usr/bin/env node
/**
 * MCP Server v2 for midex
 *
 * Resources-first architecture for workflow orchestration:
 * - 7 Resources (READ): Query workflow state and agent personas
 * - 1 Tool (WRITE): Advance workflow to next step
 *
 * All state is persisted in database (no in-memory state).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { initDatabase } from '../database/index.js';
import { getDatabasePath } from '../shared/config.js';
import { ResourceHandlers } from './resources/index.js';
import { ToolHandlers } from './tools/index.js';

/**
 * MCP Server configuration
 */
const SERVER_NAME = 'midex-mcp-v2';
const SERVER_VERSION = '2.0.0';

/**
 * Initialize MCP server v2 with resources and tools
 */
async function main() {
  // Initialize database
  const db = await initDatabase({ runMigrations: true, path: getDatabasePath() });

  // Initialize handlers
  const resourceHandlers = new ResourceHandlers(db.connection);
  const toolHandlers = new ToolHandlers(db.connection);

  // Create MCP server
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // ============================================================================
  // RESOURCES (READ-ONLY)
  // ============================================================================

  server.setRequestHandler(ListResourcesRequestSchema, async (request: ListResourcesRequest) => {
    return {
      resources: [
        {
          uri: 'midex://workflow/available_workflows',
          name: 'Available Workflows',
          description: 'List all available workflow definitions from content registry',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/workflow_details/{workflowName}',
          name: 'Workflow Details',
          description: 'Get detailed workflow definition including full content and phases',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/current_step/{executionId}',
          name: 'Current Step (PRIMARY)',
          description: 'Get current step with agent persona and continuation token. THIS IS THE MAIN RESOURCE FOR LLM CONSUMPTION.',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/workflow_status/{executionId}',
          name: 'Workflow Status',
          description: 'Get workflow execution status and high-level progress',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/step_history/{executionId}',
          name: 'Step History',
          description: 'Get complete step history for an execution',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/workflow_artifacts/{executionId}[/{stepName}]',
          name: 'Workflow Artifacts',
          description: 'Get artifacts produced by workflow (optionally filtered by step)',
          mimeType: 'application/json',
        },
        {
          uri: 'midex://workflow/telemetry[/{executionId}][?event_type={eventType}]',
          name: 'Telemetry',
          description: 'Get telemetry events and metrics (optionally filtered by execution or event type)',
          mimeType: 'application/json',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;

    try {
      // Parse URI
      const url = new URL(uri);

      if (url.protocol !== 'midex:' || url.hostname !== 'workflow') {
        throw new Error(`Invalid URI protocol/host: ${uri}`);
      }

      const pathParts = url.pathname.split('/').filter((p) => p);
      const resourceType = pathParts[0];

      let result;

      switch (resourceType) {
        case 'available_workflows':
          result = await resourceHandlers.getAvailableWorkflows();
          break;

        case 'workflow_details': {
          const workflowName = pathParts[1];
          if (!workflowName) {
            throw new Error('Missing workflow name in URI');
          }
          result = await resourceHandlers.getWorkflowDetails(workflowName);
          break;
        }

        case 'current_step': {
          const executionId = pathParts[1];
          if (!executionId) {
            throw new Error('Missing execution ID in URI');
          }
          result = await resourceHandlers.getCurrentStep(executionId);
          break;
        }

        case 'workflow_status': {
          const executionId = pathParts[1];
          if (!executionId) {
            throw new Error('Missing execution ID in URI');
          }
          result = await resourceHandlers.getWorkflowStatus(executionId);
          break;
        }

        case 'step_history': {
          const executionId = pathParts[1];
          if (!executionId) {
            throw new Error('Missing execution ID in URI');
          }
          result = await resourceHandlers.getStepHistory(executionId);
          break;
        }

        case 'workflow_artifacts': {
          const executionId = pathParts[1];
          const stepName = pathParts[2];
          if (!executionId) {
            throw new Error('Missing execution ID in URI');
          }
          result = await resourceHandlers.getWorkflowArtifacts(executionId, stepName);
          break;
        }

        case 'telemetry': {
          const executionId = pathParts[1] || undefined;
          const eventType = url.searchParams.get('event_type') || undefined;
          const limit = parseInt(url.searchParams.get('limit') || '100');
          result = await resourceHandlers.getTelemetry(executionId, eventType, limit);
          break;
        }

        default:
          throw new Error(`Unknown resource type: ${resourceType}`);
      }

      return {
        contents: [result],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  });

  // ============================================================================
  // TOOLS (WRITE OPERATIONS)
  // ============================================================================

  server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
    return {
      tools: [
        {
          name: 'workflow.next_step',
          description: [
            'Continue workflow to next step (PRIMARY TOOL for workflow execution).',
            '',
            'After completing a step:',
            '1. Read midex://workflow/current_step/{executionId} to get your tasks',
            '2. Execute the agent persona instructions',
            '3. Call this tool with the continuation_token and your output',
            '',
            'The tool will:',
            '- Validate the token',
            '- Record your step completion',
            '- Store any artifacts',
            '- Advance to the next step',
            '- Return the next agent persona and new token',
          ].join('\n'),
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Continuation token from current_step resource',
              },
              output: {
                type: 'object',
                description: 'Step output with summary and optional artifacts/findings',
                properties: {
                  summary: {
                    type: 'string',
                    description: 'Brief summary of what was accomplished in this step',
                  },
                  artifacts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of artifact IDs produced',
                  },
                  findings: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of finding IDs produced',
                  },
                  next_step_recommendation: {
                    type: 'string',
                    description: 'Optional recommendation for next step',
                  },
                },
                required: ['summary'],
              },
            },
            required: ['token', 'output'],
          },
        },
        {
          name: 'workflow.start',
          description: [
            'Start a new workflow execution.',
            '',
            'This creates a new execution, transitions to first step, and returns:',
            '- execution_id: Use this to query workflow status/steps',
            '- agent_content: The first agent persona to execute',
            '- new_token: Token for calling workflow.next_step when done',
          ].join('\n'),
          inputSchema: {
            type: 'object',
            properties: {
              workflow_name: {
                type: 'string',
                description: 'Name of workflow to start (from available_workflows resource)',
              },
              execution_id: {
                type: 'string',
                description: 'Optional custom execution ID (generated if not provided)',
              },
            },
            required: ['workflow_name'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      switch (name) {
        case 'workflow.next_step':
          result = await toolHandlers.nextStep(args);
          break;

        case 'workflow.start': {
          const { workflow_name, execution_id } = args as any;
          const execId = execution_id || `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          result = await toolHandlers.startWorkflow(workflow_name, execId);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return result;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // ============================================================================
  // SERVER STARTUP
  // ============================================================================

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
  console.error('Resources: 7 (available_workflows, workflow_details, current_step, workflow_status, step_history, workflow_artifacts, telemetry)');
  console.error('Tools: 2 (workflow.start, workflow.next_step)');

  // Cleanup on exit
  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
