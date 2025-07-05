
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

// Workflows
import { weatherWorkflow } from './workflows/weather-workflow';
import { githubToBRDWorkflow } from './workflows/github-to-brd.workflow';
import { 
  prodWorkflow,
  analyzeAndGenerateBRDWorkflow,
  taskBreakdownWorkflow,
  designAgentWorkflow,
  frontendAgentWorkflow,
  backendAgentWorkflow,
  devopsAgentWorkflow,
  testingAgentWorkflow,
  documentationAgentWorkflow,
  integrationAgentWorkflow,
  artifactPublishingWorkflow
} from './workflows/prod.workflow';

// Agents
import { weatherAgent } from './agents/weather-agent';
import { brdAgent } from './agents/brd-generator.agent';
import { taskMasterAgent } from './agents/task-master.agent';
import { taskExecutorAgent } from './agents/task-executor.agent';
import { designAgent } from './agents/design.agent';
import { frontendAgent } from './agents/frontend.agent';
import { backendAgent } from './agents/backend.agent';
import { devopsAgent } from './agents/devops.agent';
import { testingAgent } from './agents/testing.agent';
import { documentationAgent } from './agents/documentation.agent';
import { integrationAgent } from './agents/integration.agent';

// Tools
import { weatherTool } from './tools/weather-tool';
import { githubIssuesTool } from './tools/github-issues.tool';
import { githubCommentTool } from './tools/github-comment.tool';
import { githubCreateIssueTool } from './tools/github-create-issue.tool';
import { githubTaskPickupTool } from './tools/github-task-pickup.tool';
import { githubArtifactPosterTool } from './tools/github-artifact-poster.tool';
import { taskCategorizationTool } from './tools/task-categorization.tool';
import { taskValidationTool } from './tools/task-validation.tool';

export const mastra = new Mastra({
  workflows: { 
    // Original workflows
    weatherWorkflow, 
    githubToBRDWorkflow,
    
    // Production workflow (main orchestrator)
    prodWorkflow,
    
    // Sub-workflows for modular execution
    'analyze-and-generate-brd': analyzeAndGenerateBRDWorkflow,
    'task-breakdown-and-distribution': taskBreakdownWorkflow,
    'design-agent-execution': designAgentWorkflow,
    'frontend-agent-execution': frontendAgentWorkflow,
    'backend-agent-execution': backendAgentWorkflow,
    'devops-agent-execution': devopsAgentWorkflow,
    'testing-agent-execution': testingAgentWorkflow,
    'documentation-agent-execution': documentationAgentWorkflow,
    'integration-agent-execution': integrationAgentWorkflow,
    'artifact-publishing': artifactPublishingWorkflow
  },
  agents: { 
    // Core workflow agents
    weatherAgent, 
    brdAgent, 
    taskMasterAgent,
    taskExecutorAgent,
    
    // Specialized task execution agents
    designAgent,
    frontendAgent,
    backendAgent,
    devopsAgent,
    testingAgent,
    documentationAgent,
    integrationAgent
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});

// Export all components for external use
export {
  // Workflows
  weatherWorkflow,
  githubToBRDWorkflow,
  prodWorkflow,
  analyzeAndGenerateBRDWorkflow,
  taskBreakdownWorkflow,
  designAgentWorkflow,
  frontendAgentWorkflow,
  backendAgentWorkflow,
  devopsAgentWorkflow,
  testingAgentWorkflow,
  documentationAgentWorkflow,
  integrationAgentWorkflow,
  artifactPublishingWorkflow,
  
  // Agents
  weatherAgent,
  brdAgent,
  taskMasterAgent,
  taskExecutorAgent,
  designAgent,
  frontendAgent,
  backendAgent,
  devopsAgent,
  testingAgent,
  documentationAgent,
  integrationAgent,
  
  // Tools (exported separately since they're not directly registered with Mastra)
  weatherTool,
  githubIssuesTool,
  githubCommentTool,
  githubCreateIssueTool,
  githubTaskPickupTool,
  githubArtifactPosterTool,
  taskCategorizationTool,
  taskValidationTool
};

// Export grouped tools for easier access
export const tools = {
  weather: {
    weatherTool
  },
  github: {
    githubIssuesTool,
    githubCommentTool,
    githubCreateIssueTool,
    githubTaskPickupTool,
    githubArtifactPosterTool
  },
  tasks: {
    taskCategorizationTool,
    taskValidationTool
  }
};

// Export grouped agents for easier access
export const agents = {
  core: {
    weatherAgent,
    brdAgent,
    taskMasterAgent,
    taskExecutorAgent
  },
  specialized: {
    designAgent,
    frontendAgent,
    backendAgent,
    devopsAgent,
    testingAgent,
    documentationAgent,
    integrationAgent
  }
};

// Export workflows
export const workflows = {
  // Core workflows
  weatherWorkflow,
  githubToBRDWorkflow,
  prodWorkflow,
  
  // Specialized agent workflows
  analyzeAndGenerateBRDWorkflow,
  taskBreakdownWorkflow,
  designAgentWorkflow,
  frontendAgentWorkflow,
  backendAgentWorkflow,
  devopsAgentWorkflow,
  testingAgentWorkflow,
  documentationAgentWorkflow,
  integrationAgentWorkflow,
  artifactPublishingWorkflow
};
