#!/usr/bin/env node
/**
 * MCP Server for midex
 * Provides content provider and lifecycle management tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { ResourceManager } from '../src/index.js';
import { initDatabase } from '../database/index.js';
import { WorkflowLifecycleManager } from './core/persistence/workflow-lifecycle-manager.js';
import { ExecutionLogger } from './core/persistence/execution-logger.js';
import { ArtifactStore } from './core/persistence/artifact-store.js';
import { FindingStore } from './core/persistence/finding-store.js';
import { ContentProviderTools } from './tools/content/index.js';
import { LifecycleTools } from './tools/workflow/index.js';
import { LoggingTools } from './tools/logging/index.js';
import { QueryTools } from './tools/query/index.js';
import { ProjectAssociationManager } from '../src/lib/project-association.js';
import { getContentPath, getDatabasePath } from '../shared/config.js';
import { WorkflowEngine } from './core/workflow-engine.js';

/**
 * MCP Server configuration
 */
const SERVER_NAME = 'midex-mcp-server';
const SERVER_VERSION = '0.1.0';

/**
 * Initialize MCP server with all tools
 */
async function main() {
  // Initialize database and resource manager
  const db = await initDatabase({ runMigrations: true, path: getDatabasePath() });
  const resourceManager = await ResourceManager.init({
    database: db.connection,
    basePath: getContentPath(),
  });

  // Sync all resources on startup
  await resourceManager.syncAll();

  // Initialize lifecycle managers
  const lifecycleManager = new WorkflowLifecycleManager(db.connection);
  const executionLogger = new ExecutionLogger(db.connection);
  const artifactStore = new ArtifactStore(db.connection);
  const findingStore = new FindingStore(db.connection);
  const projectManager = new ProjectAssociationManager(db.connection);
  const workflowEngine = new WorkflowEngine({
    resourceManager,
    database: db,
    lifecycle: lifecycleManager,
    executionLogger,
    artifactStore,
    findingStore,
    projectManager,
  });

  // Initialize tool providers
  const contentProvider = new ContentProviderTools(resourceManager, db.connection);
  const lifecycleTools = new LifecycleTools(lifecycleManager, resourceManager, workflowEngine);
  const loggingTools = new LoggingTools(executionLogger, artifactStore, findingStore);
  const queryTools = new QueryTools(db.connection, findingStore, lifecycleManager);

  // Create MCP server
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async (request: ListToolsRequest) => {
    return {
      tools: [
        // Content Provider Tools
        {
          name: 'search_workflows',
          description: 'Search workflows by tags, keywords, or complexity with pagination',
          inputSchema: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              keywords: { type: 'array', items: { type: 'string' } },
              complexity: { type: 'string', enum: ['simple', 'moderate', 'high'] },
              detailLevel: { type: 'string', enum: ['name', 'summary', 'full'], default: 'summary' },
              page: { type: 'number', default: 1 },
              limit: { type: 'number', default: 50 },
            },
          },
        },
        {
          name: 'list_projects',
          description: 'List all discovered projects with pagination',
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'number', default: 1 },
              limit: { type: 'number', default: 50 },
            },
          },
        },
        {
          name: 'get_workflow',
          description: 'Get workflow by name with configurable detail level',
          inputSchema: {
            type: 'object',
            properties: {
              workflowName: { type: 'string' },
              detailLevel: { type: 'string', enum: ['name', 'summary', 'full'], default: 'summary' },
              includeHash: { type: 'boolean', default: true },
              ifNoneMatch: { type: 'string' },
            },
            required: ['workflowName'],
          },
        },
        {
          name: 'get_agent_persona',
          description: 'Get agent persona by name',
          inputSchema: {
            type: 'object',
            properties: {
              agentName: { type: 'string' },
              detailLevel: { type: 'string', enum: ['name', 'summary', 'full'], default: 'summary' },
              includeHash: { type: 'boolean', default: true },
              ifNoneMatch: { type: 'string' },
            },
            required: ['agentName'],
          },
        },
        {
          name: 'get_relevant_rules',
          description: 'Get rules filtered by tags, file types, or alwaysApply',
          inputSchema: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              fileTypes: { type: 'array', items: { type: 'string' } },
              alwaysApply: { type: 'boolean' },
              detailLevel: { type: 'string', enum: ['name', 'summary', 'full'], default: 'summary' },
              page: { type: 'number', default: 1 },
              limit: { type: 'number', default: 50 },
            },
          },
        },
        {
          name: 'get_project_context',
          description: 'Get or discover project context from path',
          inputSchema: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
            },
          },
        },

        // Lifecycle Tools
        {
          name: 'start_execution',
          description: 'Start a new workflow execution',
          inputSchema: {
            type: 'object',
            properties: {
              workflowName: { type: 'string' },
              projectPath: { type: 'string' },
              projectId: { type: 'number' },
              metadata: { type: 'object' },
              timeoutMs: { type: 'number' },
            },
            required: ['workflowName'],
          },
        },
        {
          name: 'get_incomplete_executions',
          description: 'Get incomplete executions for resumption',
          inputSchema: {
            type: 'object',
            properties: {
              workflowName: { type: 'string' },
            },
          },
        },

        // Logging Tools
        {
          name: 'log_execution',
          description: 'Log execution with idempotency and contract validation',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              layer: { type: 'string', enum: ['orchestrator', 'workflow', 'step', 'agent_task'] },
              layerId: { type: 'string' },
              logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
              message: { type: 'string' },
              context: { type: 'object' },
              contractInput: { type: 'object' },
              contractOutput: { type: 'object' },
            },
            required: ['executionId', 'layer', 'layerId', 'logLevel', 'message'],
          },
        },
        {
          name: 'store_artifact',
          description: 'Store an immutable artifact',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              stepId: { type: 'string' },
              name: { type: 'string' },
              contentType: { type: 'string', enum: ['text', 'markdown', 'json', 'binary'] },
              content: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['executionId', 'name', 'contentType', 'content'],
          },
        },
        {
          name: 'store_finding',
          description: 'Store a workflow finding',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              stepId: { type: 'string' },
              severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
              category: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              isGlobal: { type: 'boolean' },
              projectId: { type: 'number' },
              location: { type: 'object' },
              metadata: { type: 'object' },
            },
            required: ['executionId', 'severity', 'category', 'title', 'description'],
          },
        },

        // Query Tools
        {
          name: 'query_findings',
          description: 'Query findings with flexible filters',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              projectId: { type: 'number' },
              severity: { oneOf: [
                { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
                { type: 'array', items: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] } }
              ]},
              category: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              isGlobal: { type: 'boolean' },
              searchText: { type: 'string' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
        },
        {
          name: 'get_execution_history',
          description: 'Get execution history with filters',
          inputSchema: {
            type: 'object',
            properties: {
              workflowName: { type: 'string' },
              projectId: { type: 'number' },
              state: { type: 'string' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
        },
        {
          name: 'get_execution_details',
          description: 'Get detailed execution information',
          inputSchema: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              includeSteps: { type: 'boolean', default: true },
              includeLogs: { type: 'boolean', default: false },
              includeArtifacts: { type: 'boolean', default: false },
              includeFindings: { type: 'boolean', default: false },
            },
            required: ['executionId'],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      let result: any;

      // Content Provider Tools
      switch (name) {
        case 'search_workflows':
          result = await contentProvider.searchWorkflows(args as any);
          break;
        case 'list_projects':
          result = await contentProvider.listProjects(args as any);
          break;
        case 'get_workflow':
          result = await contentProvider.getWorkflow(args as any);
          break;
        case 'get_agent_persona':
          result = await contentProvider.getAgentPersona(args as any);
          break;
        case 'get_relevant_rules':
          result = await contentProvider.getRelevantRules(args as any);
          break;
        case 'get_project_context':
          result = await contentProvider.getProjectContext(args as any);
          break;

        // Lifecycle Tools
        case 'start_execution':
          // Auto-associate project if projectPath provided
          if ((args as any).projectPath && !(args as any).projectId) {
            const project = projectManager.associateProject((args as any).projectPath);
            (args as any).projectId = project.id;
          }
          result = await lifecycleTools.startExecution(args as any);
          break;
        case 'get_incomplete_executions':
          result = lifecycleTools.getIncompleteExecutions(args as any);
          break;

        // Logging Tools
        case 'log_execution':
          result = loggingTools.logExecution(args as any);
          break;
        case 'store_artifact':
          result = loggingTools.storeArtifact(args as any);
          break;
        case 'store_finding':
          result = loggingTools.storeFinding(args as any);
          break;

        // Query Tools
        case 'query_findings':
          result = queryTools.queryFindings(args as any);
          break;
        case 'get_execution_history':
          result = queryTools.getExecutionHistory(args as any);
          break;
        case 'get_execution_details':
          result = queryTools.getExecutionDetails(args as any);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);

  // Cleanup on exit
  process.on('SIGINT', () => {
    resourceManager.close();
    db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
