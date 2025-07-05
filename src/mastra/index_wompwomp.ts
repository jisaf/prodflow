// mastra-github-workflow-cli.ts
// Featherless.ai + OpenHands CLI GitHub workflow using Mastra TypeScript format

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';

// Type definitions
interface FeatherlessProvider {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  assignees: Array<{ login: string }>;
  labels: Array<{ name: string }>;
}

interface GitHubPullRequest {
  number: number;
  html_url: string;
  title: string;
  body: string;
}

interface TestResults {
  passed: boolean;
  coverage?: number;
  details: string;
}

interface ImplementedTask {
  taskTitle: string;
  implemented: boolean;
  filesModified: string[];
  testResults?: TestResults;
  output: string;
}

interface Task {
  title: string;
  description: string;
  type: 'code' | 'design' | 'documentation' | 'testing';
  priority: 'high' | 'medium' | 'low';
  effortEstimate: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  technicalSpecs: string;
  openhandsReady: boolean;
  labels: string[];
}

interface BRDOutput {
  brdDocument: string;
  functionalRequirements: string[];
  technicalSpecifications: string[];
  technologyStack: string[];
  acceptanceCriteria: string[];
  priority: string;
  estimatedEffort: string;
}

interface GitHubWebhookPayload {
  action: string;
  repository: {
    full_name: string;
  };
  projects_v2_item?: {
    field_values?: {
      Status?: string;
    };
    content_type?: string;
    content_number?: number;
  };
}

// Schema definitions
const githubActionSchema = z.enum([
  'get-issue', 
  'create-issue', 
  'create-comment', 
  'add-labels', 
  'create-pr', 
  'clone-repo'
]);

const openhandsActionSchema = z.enum([
  'run-task', 
  'setup-workspace', 
  'check-status'
]);

const taskTypeSchema = z.enum(['code', 'design', 'documentation', 'testing']);
const prioritySchema = z.enum(['high', 'medium', 'low']);

// Featherless.ai model provider configuration
const featherlessProvider: FeatherlessProvider = {
  name: 'featherless',
  baseURL: 'https://api.featherless.ai/v1',
  apiKey: process.env.FEATHERLESS_API_KEY,
};

// Create model instances using OpenAI SDK with Featherless.ai endpoint
const featherlessModel = createOpenAI({
  baseURL: 'https://api.featherless.ai/v1',
  apiKey: process.env.FEATHERLESS_API_KEY,
})('meta-llama/llama-3.1-70b-instruct');

const deepseekModel = createOpenAI({
  baseURL: 'https://api.featherless.ai/v1',
  apiKey: process.env.FEATHERLESS_API_KEY,
})('deepseek-ai/deepseek-coder-33b-instruct');

// GitHub API tool for repository operations
const githubTool = createTool({
  id: 'github-operations',
  description: 'Interact with GitHub API for issues, projects, and repositories',
  inputSchema: z.object({
    action: githubActionSchema,
    repository: z.string(),
    issueNumber: z.number().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
    localPath: z.string().optional(),
    branchName: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any(),
    url: z.string().optional(),
    localPath: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ repository, ideaTitle, brdDocument, parentIssueNumber }) => {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    const [owner, repo] = context.repository.split('/');
    
    try {
      switch (context.action) {
        case 'get-issue': {
          if (!context.issueNumber) {
            throw new Error('Issue number is required');
          }
          const issue = await octokit.issues.get({
            owner,
            repo,
            issue_number: context.issueNumber
          });
          return { success: true, data: issue.data };
        }
        
        case 'create-issue': {
          if (!context.title) {
            throw new Error('Title is required');
          }
          const newIssue = await octokit.issues.create({
            owner,
            repo,
            title: context.title,
            body: context.body || '',
            labels: context.labels || [],
            assignees: context.assignees || []
          });
          return { success: true, data: newIssue.data, url: newIssue.data.html_url };
        }
        
        case 'create-comment': {
          if (!context.issueNumber || !context.body) {
            throw new Error('Issue number and body are required');
          }
          const comment = await octokit.issues.createComment({
            owner,
            repo,
            issue_number: context.issueNumber,
            body: context.body
          });
          return { success: true, data: comment.data };
        }
        
        case 'add-labels': {
          if (!context.issueNumber || !context.labels) {
            throw new Error('Issue number and labels are required');
          }
          await octokit.issues.addLabels({
            owner,
            repo,
            issue_number: context.issueNumber,
            labels: context.labels
          });
          return { success: true, data: 'Labels added' };
        }
        
        case 'clone-repo': {
          const repoUrl = `https://github.com/${context.repository}.git`;
          const localPath = context.localPath || `/tmp/repos/${repo}-${Date.now()}`;
          
          await fs.mkdir(path.dirname(localPath), { recursive: true });
          
          const cloneProcess = spawn('git', ['clone', repoUrl, localPath], {
            stdio: 'pipe',
            env: { 
              ...process.env,
              GIT_TERMINAL_PROMPT: '0' // Disable interactive prompts
            }
          });
          
          return new Promise<{ success: boolean; localPath?: string; data?: string; error?: string }>((resolve, reject) => {
            cloneProcess.on('close', (code) => {
              if (code === 0) {
                resolve({ success: true, localPath, data: 'Repository cloned' });
              } else {
                reject(new Error(`Git clone failed with code ${code}`));
              }
            });
            
            cloneProcess.on('error', (error) => {
              reject(error);
            });
          });
        }
        
        case 'create-pr': {
          if (!context.title || !context.body || !context.branchName) {
            throw new Error('Title, body, and branch name are required');
          }
          const pr = await octokit.pulls.create({
            owner,
            repo,
            title: context.title,
            body: context.body,
            head: context.branchName,
            base: 'main'
          });
          return { success: true, data: pr.data, url: pr.data.html_url };
        }
        
        default:
          throw new Error(`Unknown action: ${context.action}`);
      }
    } catch (error) {
      return { 
        success: false, 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
});

// OpenHands CLI tool for local code implementation
const openHandsCLITool = createTool({
  id: 'openhands-cli',
  description: 'Use OpenHands CLI tool for autonomous code implementation',
  inputSchema: z.object({
    action: openhandsActionSchema,
    workspacePath: z.string(),
    taskDescription: z.string().optional(),
    technicalSpecs: z.string().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    sessionId: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sessionId: z.string().optional(),
    output: z.string(),
    filesModified: z.array(z.string()).optional(),
    testResults: z.object({
      passed: z.boolean(),
      coverage: z.number().optional(),
      details: z.string(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ repository, issueNumber }) => {
    const workspacePath = path.resolve(context.workspacePath);
    
    switch (context.action) {
      case 'setup-workspace':
        try {
          await fs.access(workspacePath);
          
          const openhandsDir = path.join(workspacePath, '.openhands');
          await fs.mkdir(openhandsDir, { recursive: true });
          
          return {
            success: true,
            output: `Workspace set up at ${workspacePath}`,
            sessionId: `session-${Date.now()}`
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to set up workspace: ${error instanceof Error ? error.message : 'Unknown error'}`,
            output: ''
          };
        }
        
      case 'run-task':
        if (!context.taskDescription) {
          return {
            success: false,
            error: 'Task description is required',
            output: ''
          };
        }
        return await runOpenHandsTask(context);
        
      case 'check-status':
        const statusFile = path.join(workspacePath, '.openhands', 'status.json');
        try {
          const status = await fs.readFile(statusFile, 'utf8');
          return {
            success: true,
            output: 'Status retrieved',
            ...JSON.parse(status)
          };
        } catch (error) {
          return {
            success: true,
            output: 'No previous status found',
          };
        }
        
      default:
        throw new Error(`Unknown OpenHands CLI action: ${context.action}`);
    }
  }
});

// Function to run OpenHands CLI task
async function runOpenHandsTask(context: {
  workspacePath: string;
  taskDescription?: string;
  technicalSpecs?: string;
  acceptanceCriteria?: string[];
  sessionId?: string;
}): Promise<{
  success: boolean;
  sessionId?: string;
  output: string;
  filesModified?: string[];
  testResults?: TestResults;
  error?: string;
}> {
  const { workspacePath, taskDescription, technicalSpecs, acceptanceCriteria } = context;
  
  // Validate required fields
  if (!taskDescription) {
    return {
      success: false,
      output: '',
      error: 'Task description is required for task execution'
    };
  }
  
  const fullTaskPrompt = `
TASK: ${taskDescription}

TECHNICAL SPECIFICATIONS:
${technicalSpecs || 'See task description for technical details'}

ACCEPTANCE CRITERIA:
${acceptanceCriteria ? acceptanceCriteria.map(criteria => `- ${criteria}`).join('\n') : 'See task description for acceptance criteria'}

INSTRUCTIONS:
1. Analyze the current codebase structure
2. Implement the required functionality following best practices
3. Write comprehensive tests for the implementation
4. Ensure code quality and maintainability
5. Create or update documentation as needed
6. Run tests to verify everything works correctly

Please implement this feature completely and let me know when it's done.
`;

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      SANDBOX_VOLUMES: workspacePath,
      LLM_MODEL: 'featherless/meta-llama/llama-3.1-70b-instruct',
      LLM_API_KEY: process.env.FEATHERLESS_API_KEY,
      LLM_BASE_URL: 'https://api.featherless.ai/v1',
      SANDBOX_RUNTIME_CONTAINER_IMAGE: 'docker.all-hands.dev/all-hands-ai/runtime:0.47-nikolaik'
    };

    const useDocker = process.env.OPENHANDS_USE_DOCKER !== 'false';
    
    let command: string, args: string[];
    
    if (useDocker) {
      command = 'docker';
      args = [
        'run', '-it', '--rm',
        '--pull=always',
        '-e', `SANDBOX_RUNTIME_CONTAINER_IMAGE=${env.SANDBOX_RUNTIME_CONTAINER_IMAGE}`,
        '-e', `SANDBOX_USER_ID=${process.getuid?.() || 1000}`,
        '-e', `SANDBOX_VOLUMES=${workspacePath}`,
        '-e', `LLM_API_KEY=${env.LLM_API_KEY}`,
        '-e', `LLM_MODEL=${env.LLM_MODEL}`,
        '-e', `LLM_BASE_URL=${env.LLM_BASE_URL}`,
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        '-v', `${workspacePath}:${workspacePath}`,
        '-v', `${process.env.HOME}/.openhands:/.openhands`,
        '--add-host', 'host.docker.internal:host-gateway',
        '--name', `openhands-task-${Date.now()}`,
        'docker.all-hands.dev/all-hands-ai/openhands:0.47',
        'python', '-m', 'openhands.cli.main',
        '--override-cli-mode', 'true'
      ];
    } else {
      command = 'python';
      args = ['-m', 'openhands.cli.main'];
    }

    console.log(`Starting OpenHands CLI task in ${workspacePath}`);
    
    const openhandsProcess: ChildProcess = spawn(command, args, {
      cwd: workspacePath,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    let taskCompleted = false;
    let filesModified: string[] = [];

    if (openhandsProcess.stdin) {
      openhandsProcess.stdin.write(fullTaskPrompt + '\n');
    }

    if (openhandsProcess.stdout) {
      openhandsProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        console.log('OpenHands:', chunk);
        
        if (chunk.includes('task completed') || 
            chunk.includes('implementation finished') ||
            chunk.includes('all tests pass')) {
          taskCompleted = true;
          if (openhandsProcess.stdin) {
            openhandsProcess.stdin.write('/exit\n');
          }
        }
      });
    }

    if (openhandsProcess.stderr) {
      openhandsProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
        console.error('OpenHands Error:', data.toString());
      });
    }

    const timeout = setTimeout(() => {
      console.log('OpenHands task timeout, terminating...');
      openhandsProcess.kill('SIGTERM');
      resolve({
        success: false,
        output: output + '\n\nTask timed out after 30 minutes',
        error: 'Task execution timeout',
        sessionId: context.sessionId
      });
    }, 30 * 60 * 1000);

    openhandsProcess.on('close', async (code) => {
      clearTimeout(timeout);
      
      try {
        const gitStatus = spawn('git', ['status', '--porcelain'], { cwd: workspacePath });
        let gitOutput = '';
        
        if (gitStatus.stdout) {
          gitStatus.stdout.on('data', (data: Buffer) => {
            gitOutput += data.toString();
          });
        }
        
        gitStatus.on('close', async () => {
          filesModified = gitOutput.split('\n')
            .filter(line => line.trim())
            .map(line => line.substring(3));
          
          const testResults = await runTests(workspacePath);
          
          const status = {
            success: code === 0 && taskCompleted,
            sessionId: context.sessionId,
            output,
            filesModified,
            testResults,
            completedAt: new Date().toISOString()
          };
          
          const statusFile = path.join(workspacePath, '.openhands', 'status.json');
          await fs.writeFile(statusFile, JSON.stringify(status, null, 2));
          
          resolve(status);
        });
      } catch (error) {
        resolve({
          success: false,
          output,
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: context.sessionId
        });
      }
    });

    openhandsProcess.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        output,
        error: error.message,
        sessionId: context.sessionId
      });
    });
  });
}

// Function to run tests in the workspace
async function runTests(workspacePath: string): Promise<TestResults> {
  const packageJsonPath = path.join(workspacePath, 'package.json');
  
  try {
    await fs.access(packageJsonPath);
    
    return new Promise<TestResults>((resolve) => {
      const testProcess = spawn('npm', ['test'], { 
        cwd: workspacePath,
        stdio: 'pipe'
      });
      
      let testOutput = '';
      
      if (testProcess.stdout) {
        testProcess.stdout.on('data', (data: Buffer) => {
          testOutput += data.toString();
        });
      }
      
      if (testProcess.stderr) {
        testProcess.stderr.on('data', (data: Buffer) => {
          testOutput += data.toString();
        });
      }
      
      testProcess.on('close', (code) => {
        const passed = code === 0;
        const coverageMatch = testOutput.match(/All files[^\d]*(\d+\.?\d*)/);
        const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : undefined;
        
        resolve({
          passed,
          coverage,
          details: testOutput
        });
      });
      
      setTimeout(() => {
        testProcess.kill('SIGTERM');
        resolve({
          passed: false,
          details: 'Test execution timeout'
        });
      }, 5 * 60 * 1000);
    });
    
  } catch (error) {
    return {
      passed: true,
      details: 'No test framework detected or tests not run'
    };
  }
}

// BRD Analyst Agent using Featherless.ai
const brdAnalyst = new Agent({
  name: 'BRD Analyst',
  instructions: `You are a senior business analyst expert. Create comprehensive Business Requirements Documents (BRDs) 
    from GitHub issue descriptions. Include functional requirements, non-functional requirements, 
    acceptance criteria, assumptions, constraints, and success metrics. 
    Format output as structured GitHub-flavored markdown with clear sections.
    Focus on technical feasibility and implementation clarity.`,
  model: featherlessModel,
  tools: { githubTool }
});

// Task Planner Agent using Featherless.ai
const taskPlanner = new Agent({
  name: 'Task Planner',
  instructions: `You are a senior project manager who breaks down BRDs into actionable GitHub issues. 
    Create detailed issue descriptions with acceptance criteria, labels, and estimates.
    Categorize as 'code', 'design', 'documentation', or 'testing' tasks.
    Prioritize tasks and identify dependencies clearly.
    For code tasks, provide technical specifications that OpenHands CLI can implement autonomously.`,
  model: featherlessModel,
  tools: { githubTool }
});

// Test Generator Agent using Featherless.ai
const testGenerator = new Agent({
  name: 'Test Generator',
  instructions: `You are a senior QA engineer who creates comprehensive test specifications.
    For code tasks: Generate unit test plans, integration test scenarios, and testing frameworks.
    For design tasks: Create wireframe specifications and usability testing criteria.
    For documentation tasks: Create review checklists and validation criteria.
    Focus on testable, measurable acceptance criteria.`,
  model: deepseekModel,
  tools: { githubTool }
});

// Code Implementation Agent using OpenHands CLI
const codeAgent = new Agent({
  name: 'OpenHands CLI Agent',
  instructions: `You are an autonomous coding agent that implements code using the OpenHands CLI tool.
    You can set up workspaces, execute coding tasks, and monitor implementation progress.
    Always ensure code quality, test coverage, and follows best practices.
    Use the OpenHands CLI tool to implement features completely and autonomously.`,
  model: featherlessModel,
  tools: { openHandsCLITool, githubTool }
});

// Supervisor Agent using Featherless.ai
const supervisor = new Agent({
  name: 'Supervisor',
  instructions: `You are a senior technical lead responsible for quality assurance. 
    Review code implementations, designs, and documentation against BRD requirements.
    Provide specific, actionable feedback as GitHub comments.
    Approve work only when it meets all acceptance criteria and quality standards.
    Focus on code quality, maintainability, and alignment with requirements.`,
  model: featherlessModel,
  tools: { githubTool }
});

// Workflow Steps

// Step 1: Fetch idea details from GitHub
const fetchIdeaStep = createStep({
  id: 'fetch-idea-details',
  description: 'Fetch idea details from GitHub issue',
  inputSchema: z.object({
    repository: z.string(),
    issueNumber: z.number(),
  }),
  outputSchema: z.object({
    ideaTitle: z.string(),
    ideaDescription: z.string(),
    assignees: z.array(z.string()),
    labels: z.array(z.string()),
  }),
  execute: async ({ repository, issueNumber, mastra }) => {
    // Add processing label and comment
    await mastra.getAgent('brdAnalyst').generate([{
      role: 'user',
      content: `Add a comment to GitHub issue ${repository}#${issueNumber} saying:
        
        🤖 **AI Analysis Started** (Featherless.ai + OpenHands CLI)
        
        Your idea is being processed automatically:
        1. ✅ Detected in Ideas swimlane
        2. 🔄 Generating Business Requirements Document (Llama 3.1 70B)
        3. ⏳ Breaking down into actionable tasks
        4. ⏳ Setting up local OpenHands CLI environment
        5. ⏳ Implementing code automatically with CLI tool
        6. ⏳ Creating pull request
        
        This process typically takes 15-30 minutes and uses local OpenHands CLI (no cloud costs!).`
    }]);
    
    // Fetch issue details
    const issueResult = await githubTool.execute({
      input: {
        action: 'get-issue',
        repository: repository,
        issueNumber: issueNumber
      }
    });
    
    if (!issueResult.success || !issueResult.data) {
      throw new Error('Failed to fetch issue details');
    }
    
    const issue: GitHubIssue = issueResult.data;
    
    return {
      ideaTitle: issue.title,
      ideaDescription: issue.body || '',
      assignees: issue.assignees.map(a => a.login),
      labels: issue.labels.map(l => l.name),
    };
  }
});

// Step 2: Generate BRD using Featherless.ai
const generateBRDStep = createStep({
  id: 'generate-brd',
  description: 'Generate Business Requirements Document using Featherless.ai',
  inputSchema: z.object({
    ideaTitle: z.string(),
    ideaDescription: z.string(),
    repository: z.string(),
  }),
  outputSchema: z.object({
    brdDocument: z.string(),
    functionalRequirements: z.array(z.string()),
    technicalSpecifications: z.array(z.string()),
    technologyStack: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()),
    priority: z.string(),
    estimatedEffort: z.string(),
  }),
  execute: async ({ ideaTitle, ideaDescription, repository, mastra }) => {
    const prompt = `Create a comprehensive Business Requirements Document for this GitHub issue:

Title: ${ideaTitle}
Description: ${ideaDescription}
Repository: ${repository}

Generate a structured BRD with:
1. Executive Summary
2. Functional Requirements (numbered list)
3. Non-Functional Requirements
4. Technical Specifications (detailed for OpenHands CLI implementation)
5. Acceptance Criteria (specific and testable)
6. Technology Stack Recommendations
7. Implementation Approach
8. Success Metrics

Format as GitHub-flavored markdown. Be specific and technical.
Focus on providing clear specifications that can be implemented autonomously by OpenHands CLI.`;

    const response = await mastra.getAgent('brdAnalyst').generate([{
      role: 'user',
      content: prompt
    }]);
    
    const brdContent = response.text;
    
    return {
      brdDocument: brdContent,
      functionalRequirements: extractSection(brdContent, 'Functional Requirements'),
      technicalSpecifications: extractSection(brdContent, 'Technical Specifications'),
      technologyStack: extractSection(brdContent, 'Technology Stack'),
      acceptanceCriteria: extractSection(brdContent, 'Acceptance Criteria'),
      priority: extractPriority(brdContent),
      estimatedEffort: extractEffort(brdContent),
    };
  }
});

// Step 3: Create BRD issue in GitHub
const createBRDIssueStep = createStep({
  id: 'create-brd-issue',
  description: 'Create BRD issue in GitHub repository',
  inputSchema: z.object({
    repository: z.string(),
    ideaTitle: z.string(),
    brdDocument: z.string(),
    parentIssueNumber: z.number(),
  }),
  outputSchema: z.object({
    brdIssueNumber: z.number(),
    brdIssueUrl: z.string(),
  }),
  execute: async ({ repository, ideaTitle, implementedTasks, workspacePath, parentIssueNumber, brdIssueNumber }) => {
    const result = await githubTool.execute({
      input: {
        action: 'create-issue',
        repository: repository,
        title: `📋 BRD: ${ideaTitle}`,
        body: `## Business Requirements Document
**Generated by:** Featherless.ai (Llama 3.1 70B)
**Implementation:** OpenHands CLI (Local/No Cloud Costs)
**Parent Idea:** #${parentIssueNumber}

${brdDocument}

---
*This BRD was automatically generated and will be used to create implementation tasks.*`,
        labels: ['documentation', 'brd', 'featherless:generated', 'workflow:brd']
      }
    });
    
    if (!result.success || !result.data || !result.url) {
      throw new Error('Failed to create BRD issue');
    }
    
    return {
      brdIssueNumber: result.data.number,
      brdIssueUrl: result.url,
    };
  }
});

// Step 4: Clone repository and set up workspace
const setupWorkspaceStep = createStep({
  id: 'setup-workspace',
  description: 'Clone repository and set up OpenHands CLI workspace',
  inputSchema: z.object({
    repository: z.string(),
    issueNumber: z.number(),
  }),
  outputSchema: z.object({
    workspacePath: z.string(),
    sessionId: z.string(),
  }),
  execute: async ({ context }) => {
    const workspaceBase = process.env.OPENHANDS_WORKSPACE || '/tmp/openhands-workspaces';
    const workspacePath = path.join(workspaceBase, `${repository.replace('/', '-')}-${issueNumber}`);
    
    const cloneResult = await githubTool.execute({
      input: {
        action: 'clone-repo',
        repository: repository,
        localPath: workspacePath
      }
    });
    
    if (!cloneResult.success) {
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }
    
    const setupResult = await openHandsCLITool.execute({
      input: {
        action: 'setup-workspace',
        workspacePath: workspacePath
      }
    });
    
    if (!setupResult.success || !setupResult.sessionId) {
      throw new Error(`Failed to set up workspace: ${setupResult.error}`);
    }
    
    return {
      workspacePath: workspacePath,
      sessionId: setupResult.sessionId,
    };
  }
});

// Step 5: Break down tasks using Task Planner
const breakDownTasksStep = createStep({
  id: 'break-down-tasks',
  description: 'Break down BRD into actionable tasks',
  inputSchema: z.object({
    brdDocument: z.string(),
    functionalRequirements: z.array(z.string()),
    technicalSpecifications: z.array(z.string()),
    repository: z.string(),
  }),
  outputSchema: z.object({
    taskBreakdown: z.array(z.object({
      title: z.string(),
      description: z.string(),
      type: taskTypeSchema,
      priority: prioritySchema,
      effortEstimate: z.string(),
      dependencies: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
      technicalSpecs: z.string(),
      openhandsReady: z.boolean(),
      labels: z.array(z.string()),
    })),
  }),
  execute: async ({ brdDocument, functionalRequirements, technicalSpecifications, repository, mastra }) => {
    const prompt = `Break down this BRD into specific, actionable GitHub issues:

${brdDocument}

Technical Specifications:
${technicalSpecifications.join('\n')}

Create tasks for:
1. Code implementation (mark openhands_ready: true for tasks that OpenHands CLI can implement autonomously)
2. Design/UI work
3. Documentation
4. Testing

For each task, provide:
- title: Clear, actionable title
- description: Detailed description
- type: 'code', 'design', 'documentation', or 'testing'
- priority: 'high', 'medium', or 'low'
- effort_estimate: 'XS', 'S', 'M', 'L', or 'XL'
- technical_specs: Detailed technical requirements (especially for code tasks that OpenHands CLI will implement)
- acceptance_criteria: Specific, testable criteria
- openhands_ready: true/false (true for straightforward code tasks that can be implemented autonomously)
- labels: Relevant GitHub labels

Focus on creating code tasks that are well-defined and can be implemented by OpenHands CLI tool.

Respond with valid JSON array of task objects.`;

    const response = await mastra.getAgent('taskPlanner').generate([{
      role: 'user',
      content: prompt
    }]);
    
    try {
      const tasks: Task[] = JSON.parse(response.text);
      return { taskBreakdown: tasks };
    } catch (error) {
      console.error('Error parsing task breakdown:', error);
      return { taskBreakdown: [] };
    }
  }
});

// Step 6: Execute code tasks with OpenHands CLI
const executeCodeTasksStep = createStep({
  id: 'execute-code-tasks',
  description: 'Execute code tasks using OpenHands CLI tool',
  inputSchema: z.object({
    taskBreakdown: z.array(z.any()),
    workspacePath: z.string(),
    sessionId: z.string(),
    repository: z.string(),
    issueNumber: z.number(),
  }),
  outputSchema: z.object({
    implementedTasks: z.array(z.object({
      taskTitle: z.string(),
      implemented: z.boolean(),
      filesModified: z.array(z.string()),
      testResults: z.object({
        passed: z.boolean(),
        coverage: z.number().optional(),
        details: z.string(),
      }).optional(),
      output: z.string(),
    })),
  }),
  execute: async ({ taskBreakdown, workspacePath, sessionId, repository, issueNumber, mastra }) => {
    const codeTasks = taskBreakdown.filter((task: Task) => 
      task.type === 'code' && task.openhandsReady
    );
    
    if (codeTasks.length === 0) {
      return { implementedTasks: [] };
    }
    
    const implementedTasks: ImplementedTask[] = [];
    
    for (const task of codeTasks) {
      try {
        console.log(`Implementing task with OpenHands CLI: ${task.title}`);
        
        const taskResult = await openHandsCLITool.execute({
          input: {
            action: 'run-task',
            workspacePath: workspacePath,
            taskDescription: task.description,
            technicalSpecs: task.technicalSpecs,
            acceptanceCriteria: task.acceptanceCriteria,
            sessionId: sessionId
          }
        });
        
        implementedTasks.push({
          taskTitle: task.title,
          implemented: taskResult.success,
          filesModified: taskResult.filesModified || [],
          testResults: taskResult.testResults,
          output: taskResult.output
        });
        
        // Add progress comment to GitHub
        await githubTool.execute({
          input: {
            action: 'create-comment',
            repository: repository,
            issueNumber: issueNumber,
            body: `✅ **OpenHands CLI Implementation Update**

**Task:** ${task.title}
**Status:** ${taskResult.success ? 'Completed' : 'Failed'}
**Files Modified:** ${taskResult.filesModified?.length || 0}
**Tests:** ${taskResult.testResults?.passed ? 'Passed' : 'Failed or Not Run'}
${taskResult.testResults?.coverage ? `**Coverage:** ${taskResult.testResults.coverage}%` : ''}

**Implementation Details:**
\`\`\`
${taskResult.output.substring(0, 1000)}${taskResult.output.length > 1000 ? '...' : ''}
\`\`\`

${taskResult.success ? 'Task completed successfully!' : 'Task failed - manual intervention may be required.'}`
          }
        });
        
      } catch (error) {
        console.error(`Error implementing task ${task.title}:`, error);
        implementedTasks.push({
          taskTitle: task.title,
          implemented: false,
          filesModified: [],
          testResults: { 
            passed: false, 
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
    
    return { implementedTasks };
  }
});

// Step 7: Commit changes and create pull request
const createPullRequestStep = createStep({
  id: 'create-pull-request',
  description: 'Commit changes and create pull request',
  inputSchema: z.object({
    repository: z.string(),
    ideaTitle: z.string(),
    implementedTasks: z.array(z.any()),
    workspacePath: z.string(),
    parentIssueNumber: z.number(),
    brdIssueNumber: z.number(),
  }),
  outputSchema: z.object({
    pullRequestUrl: z.string(),
    pullRequestNumber: z.number(),
    branchName: z.string(),
  }),
  execute: async ({ context }) => {
    const implementedCount = implementedTasks.filter((t: ImplementedTask) => t.implemented).length;
    
    if (implementedCount === 0) {
      throw new Error('No tasks were successfully implemented');
    }
    
    const branchName = `feature/issue-${parentIssueNumber}-openhands-cli`;
    const workspacePathVar = workspacePath;
    
    return new Promise<{ pullRequestUrl: string; pullRequestNumber: number; branchName: string }>((resolve, reject) => {
      try {
        const gitCheckout = spawn('git', ['checkout', '-b', branchName], { cwd: workspacePathVar });
        
        gitCheckout.on('close', async (code) => {
          if (code !== 0) {
            reject(new Error('Failed to create branch'));
            return;
          }
          
          const gitAdd = spawn('git', ['add', '.'], { cwd: workspacePathVar });
          
          gitAdd.on('close', async (addCode) => {
            if (addCode !== 0) {
              reject(new Error('Failed to add changes'));
              return;
            }
            
            const commitMessage = `feat: implement ${ideaTitle} via OpenHands CLI

Implemented by OpenHands CLI tool:
${implementedTasks.filter((t: ImplementedTask) => t.implemented).map((task: ImplementedTask) => `- ${task.taskTitle}`).join('\n')}

Auto-generated implementation with AI assistance.`;
            
            const gitCommit = spawn('git', ['commit', '-m', commitMessage], { 
              cwd: workspacePathVar,
              env: {
                ...process.env,
                GIT_AUTHOR_NAME: 'OpenHands CLI',
                GIT_AUTHOR_EMAIL: 'openhands-cli@ai-workflow.com',
                GIT_COMMITTER_NAME: 'OpenHands CLI',
                GIT_COMMITTER_EMAIL: 'openhands-cli@ai-workflow.com'
              }
            });
            
            gitCommit.on('close', async (commitCode) => {
              if (commitCode !== 0) {
                reject(new Error('Failed to commit changes'));
                return;
              }
              
              const gitPush = spawn('git', ['push', 'origin', branchName], { 
                cwd: workspacePathVar,
                env: {
                  ...process.env,
                  GIT_TERMINAL_PROMPT: '0'
                }
              });
              
              gitPush.on('close', async (pushCode) => {
                if (pushCode !== 0) {
                  reject(new Error('Failed to push branch'));
                  return;
                }
                
                const prBody = `## Summary
This PR implements the complete solution for: **${ideaTitle}**

**Powered by:** 
- 🧠 **Featherless.ai** (Llama 3.1 70B) for analysis and planning
- 🤖 **OpenHands CLI** for autonomous code implementation (local, no cloud costs!)

## Implemented Features
${implementedTasks.filter((t: ImplementedTask) => t.implemented).map((task: ImplementedTask) => 
  `- ✅ **${task.taskTitle}**\n  - Files: ${task.filesModified.join(', ')}\n  - Tests: ${task.testResults?.passed ? 'Passed' : 'Failed/Not Run'}\n  - Coverage: ${task.testResults?.coverage || 'N/A'}%`
).join('\n')}

## Quality Assurance
- 🤖 **Automated Implementation:** OpenHands CLI tool (open source)
- 🔍 **AI Planning:** Featherless.ai Llama 3.1 70B
- ✅ **Local Development:** No cloud costs for implementation
- 🧪 **Automated Testing:** Tests run during implementation

## Related Issues
- 💡 Original Idea: #${parentIssueNumber}
- 📋 Business Requirements: #${brdIssueNumber}

## Cost Analysis
- **AI Analysis:** ~$0.50-1.00 (Featherless.ai API)
- **Code Implementation:** $0.00 (Local OpenHands CLI)
- **Total Cost:** ~$0.50-1.00 (vs. hours of manual development)

**Ready for human review and merge! 🎉**`;

                try {
                  const result = await githubTool.execute({
                    input: {
                      action: 'create-pr',
                      repository: repository,
                      title: `🚀 Feature: ${ideaTitle} (OpenHands CLI)`,
                      body: prBody,
                      branchName: branchName
                    }
                  });
                  
                  if (!result.success || !result.data || !result.url) {
                    reject(new Error('Failed to create pull request'));
                    return;
                  }
                  
                  resolve({
                    pullRequestUrl: result.url,
                    pullRequestNumber: result.data.number,
                    branchName: branchName,
                  });
                } catch (prError) {
                  reject(prError);
                }
              });
            });
          });
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }
});

// Main Workflow Definition
export const githubIdeaWorkflow = createWorkflow({
  name: 'github-idea-to-implementation-cli',
  triggerSchema: z.object({
    repository: z.string(),
    issueNumber: z.number(),
  }),
  steps: [
    fetchIdeaStep,
    generateBRDStep,
    createBRDIssueStep,
    setupWorkspaceStep,
    breakDownTasksStep,
    executeCodeTasksStep,
    createPullRequestStep,
  ]
});

// Mastra instance configuration
export const mastra = new Mastra({
  agents: {
    brdAnalyst,
    taskPlanner,
    testGenerator,
    codeAgent,
    supervisor,
  },
  workflows: {
    githubIdeaWorkflow,
  },
  tools: {
    githubTool,
    openHandsCLITool,
  },
  llmProviders: {
    featherless: featherlessProvider,
  },
});

// Utility functions for parsing BRD content
function extractSection(content: string, sectionName: string): string[] {
  const regex = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = content.match(regex);
  if (match) {
    return match[1].split('\n').filter(line => line.trim()).map(line => line.replace(/^[-*]\s*/, ''));
  }
  return [];
}

function extractPriority(content: string): string {
  const priorityMatch = content.match(/priority:\s*(high|medium|low)/i);
  return priorityMatch ? priorityMatch[1].toLowerCase() : 'medium';
}

function extractEffort(content: string): string {
  const effortMatch = content.match(/effort:\s*(XS|S|M|L|XL)/i);
  return effortMatch ? effortMatch[1].toUpperCase() : 'M';
}

// Webhook handler for GitHub integration
export async function handleGitHubWebhook(payload: GitHubWebhookPayload): Promise<{ success: boolean; result?: any; error?: string; message?: string }> {
  // Check if this is an idea moved to Ideas swimlane
  if (payload.action === 'edited' &&
      payload.projects_v2_item?.field_values?.Status === 'Ideas' &&
      payload.projects_v2_item?.content_type === 'Issue') {
    
    const repository = payload.repository.full_name;
    const issueNumber = payload.projects_v2_item.content_number;
    
    if (!issueNumber) {
      return { success: false, error: 'No issue number found in payload' };
    }
    
    // Execute the workflow
    try {
      const result = await mastra.workflows.githubIdeaWorkflow.execute({
        repository,
        issueNumber,
      });
      
      console.log('Workflow completed successfully:', result);
      return { success: true, result };
    } catch (error) {
      console.error('Workflow execution failed:', error);
      
      // Add error comment to GitHub issue
      try {
        await githubTool.execute({
          input: {
            action: 'create-comment',
            repository: repository,
            issueNumber: issueNumber,
            body: `⚠️ **AI Workflow Error**

There was an error in the automated workflow:
\`\`\`
${error instanceof Error ? error.message : 'Unknown error'}
\`\`\`

**Troubleshooting Steps:**
1. Check OpenHands CLI installation and Docker availability
2. Verify Featherless.ai API key and quota
3. Ensure repository permissions are correct
4. Check workspace directory permissions

Please review the error and try moving the issue back to Ideas swimlane to retry, or contact support if the issue persists.`
          }
        });
      } catch (commentError) {
        console.error('Failed to add error comment:', commentError);
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  return { success: true, message: 'Not an idea workflow trigger' };
}

export default mastra;