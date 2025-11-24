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

const SERVER_NAME = 'midex-mcp';
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
      { uri: 'midex://knowledge/project/{projectId}', name: 'Project Knowledge', description: 'Active findings scoped to a project', mimeType: 'application/json' },
      { uri: 'midex://knowledge/global', name: 'Global Knowledge', description: 'Organization-wide findings', mimeType: 'application/json' },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;
    try {
      const url = new URL(uri);
      if (url.protocol !== 'midex:') throw new Error(`Invalid URI protocol: ${uri}`);

      const namespace = url.hostname;
      const pathParts = url.pathname.split('/').filter((p) => p);
      let result;

      if (namespace === 'workflow') {
        const resourceType = pathParts[0];
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
            throw new Error(`Unknown workflow resource: ${resourceType}`);
        }
      } else if (namespace === 'knowledge') {
        const resourceType = pathParts[0];
        switch (resourceType) {
          case 'project': {
            if (!pathParts[1]) throw new Error('Missing project ID');
            const projectId = Number(pathParts[1]);
            if (!Number.isFinite(projectId) || projectId <= 0) throw new Error('Invalid project ID');
            result = await resourceHandlers.getProjectKnowledge(projectId);
            break;
          }
          case 'global':
            result = await resourceHandlers.getGlobalKnowledge();
            break;
          default:
            throw new Error(`Unknown knowledge resource: ${resourceType}`);
        }
      } else {
        throw new Error(`Unknown namespace: ${namespace}`);
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
                artifacts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['file', 'data', 'report', 'finding'] },
                      title: { type: 'string' },
                      name: { type: 'string' },
                      content: { type: 'string' },
                      content_type: { type: 'string' },
                      metadata: { type: 'object' },
                    },
                    required: ['type', 'content'],
                  },
                  description: 'Optional artifacts produced in this step',
                },
                findings: { type: 'array', items: { type: 'string' }, description: 'Optional finding IDs' },
                next_step_recommendation: { type: 'string', description: 'Optional recommendation' },
                suggested_findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      scope: { type: 'string', enum: ['global', 'project', 'system'] },
                      project_id: { type: 'integer' },
                      category: { type: 'string', enum: ['security', 'architecture', 'performance', 'constraint', 'pattern'] },
                      severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
                      title: { type: 'string' },
                      content: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                      source_execution_id: { type: 'string' },
                      source_agent: { type: 'string' },
                    },
                    required: ['scope', 'category', 'severity', 'title', 'content'],
                  },
                  description: 'Optional structured findings to be promoted to knowledge base',
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
      {
        name: 'knowledge.add_finding',
        description: 'Store a long-lived finding with optional project scope.',
        inputSchema: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['global', 'project', 'system'], description: 'Scope of the finding' },
            project_id: { type: 'integer', description: 'Required when scope=project' },
            category: { type: 'string', enum: ['security', 'architecture', 'performance', 'constraint', 'pattern'] },
            severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
            title: { type: 'string' },
            content: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            source_execution_id: { type: 'string' },
            source_agent: { type: 'string' },
          },
          required: ['scope', 'category', 'severity', 'title', 'content'],
        },
      },
      {
        name: 'knowledge.update_finding',
        description: 'Update or deprecate an existing finding.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            content: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
            category: { type: 'string', enum: ['security', 'architecture', 'performance', 'constraint', 'pattern'] },
            status: { type: 'string', enum: ['active', 'deprecated'] },
          },
          required: ['id'],
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
        case 'knowledge.add_finding':
          return await toolHandlers.addKnowledgeFinding(args);
        case 'knowledge.update_finding':
          return await toolHandlers.updateKnowledgeFinding(args);
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
