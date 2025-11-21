#!/usr/bin/env node
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
import { StartWorkflowArgsSchema, buildResourceError, buildToolError, extractErrorMessage } from './lib/index.js';

const SERVER_NAME = 'midex-mcp-v2';
const SERVER_VERSION = '2.0.0';

async function main() {
  const db = await initDatabase({ runMigrations: true, path: getDatabasePath() });
  const resourceHandlers = new ResourceHandlers(db.connection);
  const toolHandlers = new ToolHandlers(db.connection);

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { resources: {}, tools: {} } }
  );

  server.setRequestHandler(ListResourcesRequestSchema, async (_request: ListResourcesRequest) => ({
    resources: [
      { uri: 'midex://workflow/available_workflows', name: 'Available Workflows', description: 'List all available workflow definitions', mimeType: 'application/json' },
      { uri: 'midex://workflow/workflow_details/{workflowName}', name: 'Workflow Details', description: 'Get detailed workflow definition', mimeType: 'application/json' },
      { uri: 'midex://workflow/current_step/{executionId}', name: 'Current Step (PRIMARY)', description: 'Get current step with agent persona and continuation token', mimeType: 'application/json' },
      { uri: 'midex://workflow/workflow_status/{executionId}', name: 'Workflow Status', description: 'Get workflow execution status', mimeType: 'application/json' },
      { uri: 'midex://workflow/step_history/{executionId}', name: 'Step History', description: 'Get complete step history', mimeType: 'application/json' },
      { uri: 'midex://workflow/workflow_artifacts/{executionId}[/{stepName}]', name: 'Workflow Artifacts', description: 'Get artifacts produced by workflow', mimeType: 'application/json' },
      { uri: 'midex://workflow/telemetry[/{executionId}][?event_type={eventType}]', name: 'Telemetry', description: 'Get telemetry events', mimeType: 'application/json' },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;
    try {
      const url = new URL(uri);
      if (url.protocol !== 'midex:' || url.hostname !== 'workflow') throw new Error(`Invalid URI: ${uri}`);

      const pathParts = url.pathname.split('/').filter((p) => p);
      const resourceType = pathParts[0];
      let result;

      switch (resourceType) {
        case 'available_workflows':
          result = await resourceHandlers.getAvailableWorkflows();
          break;
        case 'workflow_details':
          if (!pathParts[1]) throw new Error('Missing workflow name');
          result = await resourceHandlers.getWorkflowDetails(pathParts[1]);
          break;
        case 'current_step':
          if (!pathParts[1]) throw new Error('Missing execution ID');
          result = await resourceHandlers.getCurrentStep(pathParts[1]);
          break;
        case 'workflow_status':
          if (!pathParts[1]) throw new Error('Missing execution ID');
          result = await resourceHandlers.getWorkflowStatus(pathParts[1]);
          break;
        case 'step_history':
          if (!pathParts[1]) throw new Error('Missing execution ID');
          result = await resourceHandlers.getStepHistory(pathParts[1]);
          break;
        case 'workflow_artifacts':
          if (!pathParts[1]) throw new Error('Missing execution ID');
          result = await resourceHandlers.getWorkflowArtifacts(pathParts[1], pathParts[2]);
          break;
        case 'telemetry': {
          const limitParam = url.searchParams.get('limit');
          const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 100), 1000) : 100;
          result = await resourceHandlers.getTelemetry(pathParts[1], url.searchParams.get('event_type') || undefined, limit);
          break;
        }
        default:
          throw new Error(`Unknown resource: ${resourceType}`);
      }
      return { contents: [result] };
    } catch (error) {
      return { contents: [buildResourceError(uri, extractErrorMessage(error))] };
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => ({
    tools: [
      {
        name: 'workflow.next_step',
        description: 'Continue workflow to next step. Submit step output and receive next agent persona.',
        inputSchema: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'Continuation token from current_step resource' },
            output: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Brief summary of what was accomplished' },
                artifacts: { type: 'array', items: { type: 'string' }, description: 'Optional artifact IDs' },
                findings: { type: 'array', items: { type: 'string' }, description: 'Optional finding IDs' },
                next_step_recommendation: { type: 'string', description: 'Optional recommendation' },
              },
              required: ['summary'],
            },
          },
          required: ['token', 'output'],
        },
      },
      {
        name: 'workflow.start',
        description: 'Start a new workflow execution.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_name: { type: 'string', description: 'Name of workflow to start' },
            execution_id: { type: 'string', description: 'Optional custom execution ID' },
          },
          required: ['workflow_name'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'workflow.next_step':
          return await toolHandlers.nextStep(args);
        case 'workflow.start': {
          const validation = StartWorkflowArgsSchema.safeParse(args);
          if (!validation.success) return buildToolError(`Invalid arguments: ${validation.error.message}`);
          const execId = validation.data.execution_id || `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          return await toolHandlers.startWorkflow(validation.data.workflow_name, execId);
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return buildToolError(error instanceof Error ? error.message : String(error));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);

  process.on('SIGINT', () => { db.close(); process.exit(0); });
  process.on('SIGTERM', () => { db.close(); process.exit(0); });
}

main().catch((error) => { console.error('Server error:', error); process.exit(1); });
