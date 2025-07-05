import { createWorkflow, createStep } from "@mastra/core";
import { z } from "zod";
import { githubIssuesTool } from "../tools/github-issues.tool";
import { generateBRD, postBRDToGitHub, postTasksToGitHub } from "../agents/brd-generator.agent";
import { breakdownBRDIntoTasks, validateTaskBreakdown } from "../agents/task-master.agent";
import { githubTaskPickupTool } from "../tools/github-task-pickup.tool";
import { githubArtifactPosterTool } from "../tools/github-artifact-poster.tool";

// Import specialized agents
import { processDesignTask } from "../agents/design.agent";
import { processFrontendTask } from "../agents/frontend.agent";
import { processBackendTask } from "../agents/backend.agent";
import { processDevOpsTask } from "../agents/devops.agent";
import { processTestingTask } from "../agents/testing.agent";
import { processDocumentationTask } from "../agents/documentation.agent";
import { processIntegrationTask } from "../agents/integration.agent";

// Workflow Input Schema
const workflowInputSchema = z.object({
  owner: z.string().describe("GitHub repository owner"),
  repo: z.string().describe("GitHub repository name"),
  issueFilters: z.object({
    state: z.enum(["open", "closed", "all"]).default("open"),
    labels: z.array(z.string()).optional(),
    assignee: z.string().optional(),
    limit: z.number().min(1).max(50).default(20)
  }).optional(),
  projectContext: z.object({
    projectName: z.string(),
    stakeholders: z.array(z.string()),
    businessObjectives: z.array(z.string()),
    constraints: z.array(z.string()).optional(),
    technologyStack: z.array(z.string()).default(["JavaScript", "Node.js", "React"])
  }).describe("Project context and technology stack"),
  executionConfig: z.object({
    enableTaskGeneration: z.boolean().default(true),
    enableTaskExecution: z.boolean().default(true),
    maxConcurrentTasks: z.number().min(1).max(10).default(3),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    autoCommit: z.boolean().default(false)
  }).default({
    enableTaskGeneration: true,
    enableTaskExecution: true,
    maxConcurrentTasks: 3,
    autoCommit: false
  })
});

// Shared schemas for data flow
const analysisResultSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  projectContext: z.object({
    projectName: z.string(),
    stakeholders: z.array(z.string()),
    businessObjectives: z.array(z.string()),
    constraints: z.array(z.string()).optional(),
    technologyStack: z.array(z.string())
  }),
  executionConfig: z.object({
    enableTaskGeneration: z.boolean(),
    enableTaskExecution: z.boolean(),
    maxConcurrentTasks: z.number(),
    categories: z.array(z.string()).optional(),
    priority: z.string().optional(),
    autoCommit: z.boolean()
  }),
  issues: z.array(z.any()),
  analysis: z.object({
    totalIssues: z.number(),
    openIssues: z.number(),
    closedIssues: z.number(),
    topLabels: z.array(z.string())
  })
});

const brdResultSchema = analysisResultSchema.extend({
  brd: z.string(),
  brdPosted: z.boolean()
});

const taskResultSchema = brdResultSchema.extend({
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
    priority: z.enum(["critical", "high", "medium", "low"]),
    complexity: z.enum(["simple", "moderate", "complex"]),
    dependencies: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()),
    issueNumber: z.number().optional()
  }))
});

const taskExecutionResultSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
  status: z.enum(["completed", "failed", "skipped"]),
  artifact: z.object({
    type: z.string(),
    content: z.string(),
    format: z.string()
  }).optional(),
  artifactUrl: z.string().optional(),
  executionTime: z.number(),
  message: z.string()
});

// Step 1: Issue Analysis
const analyzeIssuesStep = createStep({
  id: "analyze-github-issues",
  description: "Analyze GitHub issues and extract project requirements",
  inputSchema: workflowInputSchema,
  outputSchema: analysisResultSchema,
  execute: async ({ inputData }) => {
    const { owner, repo, issueFilters, projectContext, executionConfig } = inputData;
    
    console.log(`🔍 Analyzing GitHub issues from ${owner}/${repo}...`);
    
    // Fetch GitHub issues
    const issuesResult = await githubIssuesTool.execute({
      context: {
        owner,
        repo,
        state: issueFilters?.state || "open",
        labels: issueFilters?.labels,
        assignee: issueFilters?.assignee,
        limit: issueFilters?.limit || 20,
        includeAIGenerated: false
      },
      runtimeContext: new Map() as any
    });
    
    const issues = issuesResult.issues || [];
    
    // Analyze issues
    const openIssues = issues.filter((i: any) => i.state === 'open').length;
    const closedIssues = issues.filter((i: any) => i.state === 'closed').length;
    const labelCounts = new Map();
    
    issues.forEach((issue: any) => {
      issue.labels?.forEach((label: any) => {
        labelCounts.set(label.name, (labelCounts.get(label.name) || 0) + 1);
      });
    });
    
    const topLabels = Array.from(labelCounts.entries())
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .map(([label]: any) => label);
    
    console.log(`✅ Analysis complete: ${issues.length} issues processed`);
    
    return {
      owner,
      repo,
      projectContext,
      executionConfig,
      issues,
      analysis: {
        totalIssues: issues.length,
        openIssues,
        closedIssues,
        topLabels
      }
    };
  }
});

// Step 2: BRD Generation
const generateBRDStep = createStep({
  id: "generate-business-requirements",
  description: "Generate Business Requirements Document from analyzed issues",
  inputSchema: analysisResultSchema,
  outputSchema: brdResultSchema,
  execute: async ({ inputData }) => {
    const { owner, repo, projectContext, executionConfig, issues, analysis } = inputData;
    
    console.log(`📄 Generating Business Requirements Document...`);
    
    // Generate BRD using the agent
    const brd = await generateBRD({ issues }, {
      projectName: projectContext.projectName,
      stakeholders: projectContext.stakeholders,
      businessObjectives: projectContext.businessObjectives,
      constraints: projectContext.constraints
    });
    
    // Post BRD to GitHub
    const brdPostResults = await postBRDToGitHub(
      brd,
      owner,
      repo,
      issues.map((issue: any) => issue.number),
      projectContext.projectName
    );
    
    const brdPosted = brdPostResults.some((result: any) => result.success);
    
    console.log(`✅ BRD generated and posted to GitHub: ${brdPosted}`);
    
    return {
      ...inputData,
      brd,
      brdPosted
    };
  }
});

// Step 3: Task Breakdown
const breakdownTasksStep = createStep({
  id: "breakdown-into-tasks",
  description: "Break down BRD into discrete AI-executable tasks",
  inputSchema: brdResultSchema,
  outputSchema: taskResultSchema,
  execute: async ({ inputData }) => {
    const { brd, projectContext, executionConfig } = inputData;
    
    if (!executionConfig.enableTaskGeneration) {
      console.log("⏭️ Task generation disabled, skipping...");
      return { ...inputData, tasks: [] };
    }
    
    console.log(`🔨 Breaking down BRD into executable tasks...`);
    
    // Break down BRD into tasks
    const taskProjectContext = {
      projectName: projectContext.projectName,
      technology: projectContext.technologyStack,
      executionMode: "autonomous",
      constraints: projectContext.constraints
    };
    
    const taskBreakdownText = await breakdownBRDIntoTasks(brd, taskProjectContext);
    
    // Parse tasks from the breakdown (simplified parsing)
    const tasks = parseTasksFromBreakdown(taskBreakdownText);
    
    // Post tasks to GitHub as issues
    if (tasks.length > 0) {
      const taskPostResults = await postTasksToGitHub(
        tasks,
        inputData.owner,
        inputData.repo,
        { projectName: projectContext.projectName, technologyStack: projectContext.technologyStack }
      );
      
      // Update tasks with issue numbers
      tasks.forEach((task: any, index: number) => {
        const postResult = taskPostResults[index];
        if (postResult?.success && postResult.issueNumber) {
          task.issueNumber = postResult.issueNumber;
        }
      });
    }
    
    console.log(`✅ Generated ${tasks.length} executable tasks`);
    
    return {
      ...inputData,
      tasks
    };
  }
});

// Step 4: Task Execution Coordinator
const coordinateTaskExecutionStep = createStep({
  id: "coordinate-task-execution",
  description: "Coordinate parallel execution of tasks by specialized agents",
  inputSchema: taskResultSchema,
  outputSchema: taskResultSchema.extend({
    executionResults: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, executionConfig, projectContext } = inputData;
    
    if (!executionConfig.enableTaskExecution || tasks.length === 0) {
      console.log("⏭️ Task execution disabled or no tasks available");
      return { ...inputData, executionResults: [] };
    }
    
    console.log(`🚀 Coordinating execution of ${tasks.length} tasks...`);
    
    // Filter tasks based on configuration
    let filteredTasks = tasks;
    if (executionConfig.categories) {
      filteredTasks = tasks.filter((task: any) => 
        executionConfig.categories!.includes(task.category)
      );
    }
    
    if (executionConfig.priority) {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const minPriorityLevel = priorityOrder[executionConfig.priority as keyof typeof priorityOrder];
      filteredTasks = filteredTasks.filter((task: any) => 
        priorityOrder[task.priority as keyof typeof priorityOrder] >= minPriorityLevel
      );
    }
    
    // Group tasks by category for parallel execution
    const tasksByCategory = filteredTasks.reduce((acc: any, task: any) => {
      if (!acc[task.category]) acc[task.category] = [];
      acc[task.category].push(task);
      return acc;
    }, {});
    
    console.log(`📊 Task distribution: ${Object.keys(tasksByCategory).join(', ')}`);
    
    // Execute tasks in parallel by category (up to maxConcurrentTasks)
    const executionPromises = Object.entries(tasksByCategory)
      .slice(0, executionConfig.maxConcurrentTasks)
      .map(([category, categoryTasks]: [string, any]) => 
        executeCategoryTasks(category, categoryTasks, projectContext)
      );
    
    const categoryResults = await Promise.allSettled(executionPromises);
    
    // Flatten results
    const executionResults: any[] = [];
    categoryResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        executionResults.push(...result.value);
      } else {
        console.error(`❌ Category execution failed:`, result.reason);
      }
    });
    
    console.log(`✅ Task execution complete: ${executionResults.length} results`);
    
    return {
      ...inputData,
      executionResults
    };
  }
});

// Specialized Agent Execution Steps
const executeDesignTasksStep = createStep({
  id: "execute-design-tasks",
  description: "Execute design tasks using Design Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const designTasks = tasks.filter((task: any) => task.category === 'design');
    
    console.log(`🎨 Executing ${designTasks.length} design tasks...`);
    
    const results = await Promise.all(
      designTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processDesignTask(task, {
            technologyStack: projectContext.technologyStack,
            designSystem: projectContext.designSystem,
            brandGuidelines: projectContext.brandGuidelines
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'design' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Design specifications completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'design' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeFrontendTasksStep = createStep({
  id: "execute-frontend-tasks",
  description: "Execute frontend tasks using Frontend Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const frontendTasks = tasks.filter((task: any) => task.category === 'frontend');
    
    console.log(`⚛️ Executing ${frontendTasks.length} frontend tasks...`);
    
    const results = await Promise.all(
      frontendTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processFrontendTask(task, {
            technologyStack: projectContext.technologyStack,
            framework: projectContext.framework || 'React',
            stylingApproach: projectContext.stylingApproach,
            stateManagement: projectContext.stateManagement
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'frontend' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Frontend implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'frontend' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeBackendTasksStep = createStep({
  id: "execute-backend-tasks",
  description: "Execute backend tasks using Backend Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const backendTasks = tasks.filter((task: any) => task.category === 'backend');
    
    console.log(`🔧 Executing ${backendTasks.length} backend tasks...`);
    
    const results = await Promise.all(
      backendTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processBackendTask(task, {
            technologyStack: projectContext.technologyStack,
            database: projectContext.database || 'PostgreSQL',
            authStrategy: projectContext.authStrategy,
            deploymentTarget: projectContext.deploymentTarget
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'backend' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Backend implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'backend' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeDevOpsTasksStep = createStep({
  id: "execute-devops-tasks",
  description: "Execute DevOps tasks using DevOps Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const devopsTasks = tasks.filter((task: any) => task.category === 'devops');
    
    console.log(`🚀 Executing ${devopsTasks.length} DevOps tasks...`);
    
    const results = await Promise.all(
      devopsTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processDevOpsTask(task, {
            technologyStack: projectContext.technologyStack,
            cloudProvider: projectContext.cloudProvider || 'AWS',
            environment: projectContext.environment || 'production',
            scalingRequirements: projectContext.scalingRequirements
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'devops' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'DevOps implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'devops' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeTestingTasksStep = createStep({
  id: "execute-testing-tasks",
  description: "Execute testing tasks using Testing Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const testingTasks = tasks.filter((task: any) => task.category === 'testing');
    
    console.log(`🧪 Executing ${testingTasks.length} testing tasks...`);
    
    const results = await Promise.all(
      testingTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processTestingTask(task, {
            technologyStack: projectContext.technologyStack,
            testingFramework: projectContext.testingFramework || 'Jest',
            coverageTarget: projectContext.coverageTarget || 80,
            performanceRequirements: projectContext.performanceRequirements
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'testing' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Testing implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'testing' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeDocumentationTasksStep = createStep({
  id: "execute-documentation-tasks",
  description: "Execute documentation tasks using Documentation Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const docTasks = tasks.filter((task: any) => task.category === 'documentation');
    
    console.log(`📚 Executing ${docTasks.length} documentation tasks...`);
    
    const results = await Promise.all(
      docTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processDocumentationTask(task, {
            technologyStack: projectContext.technologyStack,
            audience: ['developers', 'users'],
            documentationType: 'technical',
            existingDocs: projectContext.existingDocs
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'documentation' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Documentation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'documentation' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

const executeIntegrationTasksStep = createStep({
  id: "execute-integration-tasks",
  description: "Execute integration tasks using Integration Agent",
  inputSchema: z.object({
    tasks: z.array(z.any()),
    projectContext: z.any()
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    const integrationTasks = tasks.filter((task: any) => task.category === 'integration');
    
    console.log(`🔌 Executing ${integrationTasks.length} integration tasks...`);
    
    const results = await Promise.all(
      integrationTasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processIntegrationTask(task, {
            technologyStack: projectContext.technologyStack,
            integrationType: 'api',
            dataVolume: projectContext.dataVolume,
            securityRequirements: projectContext.securityRequirements
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'integration' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: 'Integration implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'integration' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    return { results };
  }
});

// Step 5: Artifact Publishing
const publishArtifactsStep = createStep({
  id: "publish-artifacts",
  description: "Publish all generated artifacts back to GitHub",
  inputSchema: taskResultSchema.extend({
    executionResults: z.array(taskExecutionResultSchema)
  }),
  outputSchema: z.object({
    publishResults: z.array(z.object({
      taskId: z.string(),
      category: z.string(),
      success: z.boolean(),
      artifactUrl: z.string().optional(),
      message: z.string()
    })),
    summary: z.object({
      totalTasks: z.number(),
      successful: z.number(),
      failed: z.number(),
      published: z.number()
    })
  }),
  execute: async ({ inputData }) => {
    const { owner, repo, executionResults } = inputData;
    
    console.log(`📤 Publishing ${executionResults.length} artifacts to GitHub...`);
    
    const publishResults = await Promise.all(
      executionResults.map(async (result: any) => {
        if (result.status !== 'completed' || !result.artifact) {
          return {
            taskId: result.taskId,
            category: result.category,
            success: false,
            message: 'No artifact to publish'
          };
        }
        
        try {
          // Map category to artifact type
          const artifactTypeMap: Record<string, string> = {
            "design": "design-specifications",
            "frontend": "frontend-code",
            "backend": "backend-code",
            "devops": "devops-infrastructure",
            "testing": "testing-suite",
            "documentation": "documentation",
            "integration": "integration-code"
          };
          
          const artifactType = artifactTypeMap[result.category] || "backend-code";
          
          // Find corresponding task for issue number
          const task = inputData.tasks.find((t: any) => t.id === result.taskId);
          const issueNumber = task?.issueNumber;
          
          if (!issueNumber) {
            return {
              taskId: result.taskId,
              category: result.category,
              success: false,
              message: 'No GitHub issue number found for task'
            };
          }
          
          const publishResult = await githubArtifactPosterTool.execute({
            context: {
              owner,
              repo,
              issueNumber,
              artifact: {
                type: artifactType as any,
                content: result.artifact.content,
                format: result.artifact.format,
                title: result.title,
                description: `AI-generated ${result.category} implementation`
              },
              postingMethod: "comment"
            },
            runtimeContext: new Map() as any
          });
          
          return {
            taskId: result.taskId,
            category: result.category,
            success: publishResult.success,
            artifactUrl: publishResult.url,
            message: publishResult.message
          };
        } catch (error) {
          return {
            taskId: result.taskId,
            category: result.category,
            success: false,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
    
    const summary = {
      totalTasks: executionResults.length,
      successful: executionResults.filter((r: any) => r.status === 'completed').length,
      failed: executionResults.filter((r: any) => r.status === 'failed').length,
      published: publishResults.filter((r: any) => r.success).length
    };
    
    console.log(`✅ Artifact publishing complete: ${summary.published}/${summary.totalTasks} published`);
    
    return { publishResults, summary };
  }
});

// Helper function to execute tasks by category
async function executeCategoryTasks(category: string, tasks: any[], projectContext: any) {
  const results = [];
  
  for (const task of tasks) {
    const startTime = Date.now();
    try {
      let result;
      
      switch (category) {
        case 'design':
          result = await processDesignTask(task, {
            technologyStack: projectContext.technologyStack,
            designSystem: projectContext.designSystem,
            brandGuidelines: projectContext.brandGuidelines
          });
          break;
        case 'frontend':
          result = await processFrontendTask(task, {
            technologyStack: projectContext.technologyStack,
            framework: projectContext.framework || 'React',
            stylingApproach: projectContext.stylingApproach,
            stateManagement: projectContext.stateManagement
          });
          break;
        case 'backend':
          result = await processBackendTask(task, {
            technologyStack: projectContext.technologyStack,
            database: projectContext.database || 'PostgreSQL',
            authStrategy: projectContext.authStrategy,
            deploymentTarget: projectContext.deploymentTarget
          });
          break;
        case 'devops':
          result = await processDevOpsTask(task, {
            technologyStack: projectContext.technologyStack,
            cloudProvider: projectContext.cloudProvider || 'AWS',
            environment: projectContext.environment || 'production',
            scalingRequirements: projectContext.scalingRequirements
          });
          break;
        case 'testing':
          result = await processTestingTask(task, {
            technologyStack: projectContext.technologyStack,
            testingFramework: projectContext.testingFramework || 'Jest',
            coverageTarget: projectContext.coverageTarget || 80,
            performanceRequirements: projectContext.performanceRequirements
          });
          break;
        case 'documentation':
          result = await processDocumentationTask(task, {
            technologyStack: projectContext.technologyStack,
            audience: ['developers', 'users'],
            documentationType: 'technical',
            existingDocs: projectContext.existingDocs
          });
          break;
        case 'integration':
          result = await processIntegrationTask(task, {
            technologyStack: projectContext.technologyStack,
            integrationType: 'api',
            dataVolume: projectContext.dataVolume,
            securityRequirements: projectContext.securityRequirements
          });
          break;
        default:
          throw new Error(`Unsupported task category: ${category}`);
      }
      
      results.push({
        taskId: task.id,
        title: task.title,
        category: category as any,
        status: 'completed' as const,
        artifact: result.artifacts,
        executionTime: Date.now() - startTime,
        message: `${category} implementation completed successfully`
      });
    } catch (error) {
      results.push({
        taskId: task.id,
        title: task.title,
        category: category as any,
        status: 'failed' as const,
        executionTime: Date.now() - startTime,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}

// Helper function to parse tasks from breakdown text
function parseTasksFromBreakdown(breakdownText: string) {
  const tasks = [];
  const lines = breakdownText.split('\n');
  let currentTask = null;
  let taskId = 1;
  
  for (const line of lines) {
    if (line.trim().startsWith('##') || line.trim().startsWith('**Task')) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      
      const title = line.replace(/[#*]/g, '').trim();
      const titleLower = title.toLowerCase();
      
      // Determine category
      let category = 'backend';
      if (titleLower.includes('design') || titleLower.includes('ui')) category = 'design';
      else if (titleLower.includes('frontend') || titleLower.includes('component')) category = 'frontend';
      else if (titleLower.includes('backend') || titleLower.includes('api')) category = 'backend';
      else if (titleLower.includes('deploy') || titleLower.includes('devops')) category = 'devops';
      else if (titleLower.includes('test')) category = 'testing';
      else if (titleLower.includes('document')) category = 'documentation';
      else if (titleLower.includes('integration')) category = 'integration';
      
      // Determine priority
      let priority = 'medium';
      if (titleLower.includes('critical') || titleLower.includes('urgent')) priority = 'critical';
      else if (titleLower.includes('important') || titleLower.includes('high')) priority = 'high';
      else if (titleLower.includes('nice') || titleLower.includes('low')) priority = 'low';
      
      // Determine complexity
      let complexity = 'moderate';
      if (titleLower.includes('simple') || titleLower.includes('basic')) complexity = 'simple';
      else if (titleLower.includes('complex') || titleLower.includes('advanced')) complexity = 'complex';
      
      currentTask = {
        id: `task-${taskId++}`,
        title,
        description: '',
        category: category as any,
        priority: priority as any,
        complexity: complexity as any,
        dependencies: [],
        acceptanceCriteria: ['Implementation is complete and functional', 'Code follows established patterns']
      };
    } else if (currentTask && line.trim()) {
      currentTask.description += line.trim() + ' ';
    }
  }
  
  if (currentTask) {
    tasks.push(currentTask);
  }
  
  return tasks;
}

// Main Production Workflow
export const prodWorkflow = createWorkflow({
  id: "production-ai-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    analysis: z.object({
      totalIssues: z.number(),
      openIssues: z.number(),
      closedIssues: z.number(),
      topLabels: z.array(z.string())
    }),
    brd: z.string(),
    brdPosted: z.boolean(),
    tasks: z.array(z.any()),
    executionResults: z.array(taskExecutionResultSchema),
    publishResults: z.array(z.any()),
    summary: z.object({
      totalTasks: z.number(),
      successful: z.number(),
      failed: z.number(),
      published: z.number()
    })
  })
})
.then(analyzeIssuesStep)
.then(generateBRDStep)
.then(breakdownTasksStep)
.then(coordinateTaskExecutionStep)
.then(publishArtifactsStep)
.commit();

// Export individual steps for potential standalone use
export {
  analyzeIssuesStep,
  generateBRDStep,
  breakdownTasksStep,
  coordinateTaskExecutionStep,
  executeDesignTasksStep,
  executeFrontendTasksStep,
  executeBackendTasksStep,
  executeDevOpsTasksStep,
  executeTestingTasksStep,
  executeDocumentationTasksStep,
  executeIntegrationTasksStep,
  publishArtifactsStep
};