import { createWorkflow, createStep } from "@mastra/core";
import { z } from "zod";
import { githubIssuesTool } from "../tools/github-issues.tool";
import { generateBRD, postBRDToGitHub, postTasksToGitHub } from "../agents/brd-generator.agent";
import { breakdownBRDIntoTasks } from "../agents/task-master.agent";
import { githubArtifactPosterTool } from "../tools/github-artifact-poster.tool";

// Import specialized agents
import { processDesignTask } from "../agents/design.agent";
import { processFrontendTask } from "../agents/frontend.agent";
import { processBackendTask } from "../agents/backend.agent";
import { processDevOpsTask } from "../agents/devops.agent";
import { processTestingTask } from "../agents/testing.agent";
import { processDocumentationTask } from "../agents/documentation.agent";
import { processIntegrationTask } from "../agents/integration.agent";

// Base schemas
const projectContextSchema = z.object({
  projectName: z.string(),
  stakeholders: z.array(z.string()),
  businessObjectives: z.array(z.string()),
  constraints: z.array(z.string()).optional(),
  technologyStack: z.array(z.string()).default(["JavaScript", "Node.js", "React"])
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  complexity: z.enum(["simple", "moderate", "complex"]),
  dependencies: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  issueNumber: z.number().optional()
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

// Main workflow input
const workflowInputSchema = z.object({
  owner: z.string().describe("GitHub repository owner"),
  repo: z.string().describe("GitHub repository name"),
  issueFilters: z.object({
    state: z.enum(["open", "closed", "all"]).default("open"),
    labels: z.array(z.string()).optional(),
    assignee: z.string().optional(),
    limit: z.number().min(1).max(50).default(20)
  }).optional(),
  projectContext: projectContextSchema,
  executionConfig: z.object({
    enableTaskGeneration: z.boolean().default(true),
    enableTaskExecution: z.boolean().default(true),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    autoCommit: z.boolean().default(false)
  }).default({
    enableTaskGeneration: true,
    enableTaskExecution: true,
    autoCommit: false
  })
});

// Task distribution schema for parallel execution
const taskDistributionSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  projectContext: projectContextSchema,
  executionConfig: z.object({
    enableTaskExecution: z.boolean(),
    categories: z.array(z.string()).optional(),
    priority: z.string().optional(),
    autoCommit: z.boolean()
  }),
  designTasks: z.array(taskSchema),
  frontendTasks: z.array(taskSchema),
  backendTasks: z.array(taskSchema),
  devopsTasks: z.array(taskSchema),
  testingTasks: z.array(taskSchema),
  documentationTasks: z.array(taskSchema),
  integrationTasks: z.array(taskSchema)
});

// PHASE 1: Issue Analysis and BRD Generation
const analyzeAndGenerateBRDWorkflow = createWorkflow({
  id: "analyze-and-generate-brd",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
      categories: z.array(z.string()).optional(),
      priority: z.string().optional(),
      autoCommit: z.boolean()
    }),
    analysis: z.object({
      totalIssues: z.number(),
      openIssues: z.number(),
      closedIssues: z.number(),
      topLabels: z.array(z.string())
    }),
    brd: z.string(),
    brdPosted: z.boolean()
  })
})
.then(createStep({
  id: "analyze-github-issues",
  description: "Analyze GitHub issues and extract requirements",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
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
  }),
  execute: async ({ inputData }) => {
    const { owner, repo, issueFilters, projectContext, executionConfig } = inputData;
    
    console.log(`🔍 Analyzing GitHub issues from ${owner}/${repo}...`);
    
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
}))
.then(createStep({
  id: "generate-brd",
  description: "Generate Business Requirements Document",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
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
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
      categories: z.array(z.string()).optional(),
      priority: z.string().optional(),
      autoCommit: z.boolean()
    }),
    analysis: z.object({
      totalIssues: z.number(),
      openIssues: z.number(),
      closedIssues: z.number(),
      topLabels: z.array(z.string())
    }),
    brd: z.string(),
    brdPosted: z.boolean()
  }),
  execute: async ({ inputData }) => {
    const { owner, repo, projectContext, executionConfig, issues, analysis } = inputData;
    
    console.log(`📄 Generating Business Requirements Document...`);
    
    const brd = await generateBRD({ issues }, {
      projectName: projectContext.projectName,
      stakeholders: projectContext.stakeholders,
      businessObjectives: projectContext.businessObjectives,
      constraints: projectContext.constraints
    });
    
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
      owner,
      repo,
      projectContext,
      executionConfig,
      analysis,
      brd,
      brdPosted
    };
  }
}))
.commit();

// PHASE 2: Task Breakdown and Distribution
const taskBreakdownWorkflow = createWorkflow({
  id: "task-breakdown-and-distribution",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
      categories: z.array(z.string()).optional(),
      priority: z.string().optional(),
      autoCommit: z.boolean()
    }),
    brd: z.string()
  }),
  outputSchema: taskDistributionSchema
})
.then(createStep({
  id: "breakdown-brd-into-tasks",
  description: "Break down BRD into categorized tasks for specialized agents",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    projectContext: projectContextSchema,
    executionConfig: z.object({
      enableTaskGeneration: z.boolean(),
      enableTaskExecution: z.boolean(),
      categories: z.array(z.string()).optional(),
      priority: z.string().optional(),
      autoCommit: z.boolean()
    }),
    brd: z.string()
  }),
  outputSchema: taskDistributionSchema,
  execute: async ({ inputData }) => {
    const { owner, repo, projectContext, executionConfig, brd } = inputData;
    
    if (!executionConfig.enableTaskGeneration) {
      console.log("⏭️ Task generation disabled, skipping...");
      return {
        owner,
        repo,
        projectContext,
        executionConfig,
        designTasks: [],
        frontendTasks: [],
        backendTasks: [],
        devopsTasks: [],
        testingTasks: [],
        documentationTasks: [],
        integrationTasks: []
      };
    }
    
    console.log(`🔨 Breaking down BRD into executable tasks...`);
    
    const taskProjectContext = {
      projectName: projectContext.projectName,
      technology: projectContext.technologyStack,
      executionMode: "autonomous",
      constraints: projectContext.constraints
    };
    
    const taskBreakdownText = await breakdownBRDIntoTasks(brd, taskProjectContext);
    const allTasks = parseTasksFromBreakdown(taskBreakdownText);
    
    // Post tasks to GitHub and update with issue numbers
    if (allTasks.length > 0) {
      const taskPostResults = await postTasksToGitHub(
        allTasks,
        owner,
        repo,
        { projectName: projectContext.projectName, technologyStack: projectContext.technologyStack }
      );
      
      allTasks.forEach((task: any, index: number) => {
        const postResult = taskPostResults[index];
        if (postResult?.success && postResult.issueNumber) {
          task.issueNumber = postResult.issueNumber;
        }
      });
    }
    
    // Filter tasks based on configuration
    let filteredTasks = allTasks;
    if (executionConfig.categories) {
      filteredTasks = allTasks.filter((task: any) => 
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
    
    // Distribute tasks by category
    const taskDistribution = {
      owner,
      repo,
      projectContext,
      executionConfig,
      designTasks: filteredTasks.filter((task: any) => task.category === 'design'),
      frontendTasks: filteredTasks.filter((task: any) => task.category === 'frontend'),
      backendTasks: filteredTasks.filter((task: any) => task.category === 'backend'),
      devopsTasks: filteredTasks.filter((task: any) => task.category === 'devops'),
      testingTasks: filteredTasks.filter((task: any) => task.category === 'testing'),
      documentationTasks: filteredTasks.filter((task: any) => task.category === 'documentation'),
      integrationTasks: filteredTasks.filter((task: any) => task.category === 'integration')
    };
    
    console.log(`✅ Task distribution complete:`);
    console.log(`  🎨 Design: ${taskDistribution.designTasks.length}`);
    console.log(`  ⚛️ Frontend: ${taskDistribution.frontendTasks.length}`);
    console.log(`  🔧 Backend: ${taskDistribution.backendTasks.length}`);
    console.log(`  🚀 DevOps: ${taskDistribution.devopsTasks.length}`);
    console.log(`  🧪 Testing: ${taskDistribution.testingTasks.length}`);
    console.log(`  📚 Documentation: ${taskDistribution.documentationTasks.length}`);
    console.log(`  🔌 Integration: ${taskDistribution.integrationTasks.length}`);
    
    return taskDistribution;
  }
}))
.commit();

// PHASE 3A: Design Agent Workflow
const designAgentWorkflow = createWorkflow({
  id: "design-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-design-tasks",
  description: "🎨 Execute design tasks using Design Agent (Claude Sonnet 4)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`🎨 Design Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
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
            message: '🎨 Design specifications completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'design' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Design task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Design Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3B: Frontend Agent Workflow
const frontendAgentWorkflow = createWorkflow({
  id: "frontend-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-frontend-tasks",
  description: "⚛️ Execute frontend tasks using Frontend Agent (Claude Sonnet 4)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`⚛️ Frontend Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processFrontendTask(task, {
            technologyStack: projectContext.technologyStack,
            framework: 'React',
            stylingApproach: 'CSS Modules',
            stateManagement: 'React Hooks'
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'frontend' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '⚛️ Frontend implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'frontend' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Frontend task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Frontend Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3C: Backend Agent Workflow
const backendAgentWorkflow = createWorkflow({
  id: "backend-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-backend-tasks",
  description: "🔧 Execute backend tasks using Backend Agent (GPT-4o)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`🔧 Backend Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processBackendTask(task, {
            technologyStack: projectContext.technologyStack,
            database: 'PostgreSQL',
            authStrategy: 'JWT',
            deploymentTarget: 'Docker'
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'backend' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '🔧 Backend implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'backend' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Backend task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Backend Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3D: DevOps Agent Workflow
const devopsAgentWorkflow = createWorkflow({
  id: "devops-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-devops-tasks",
  description: "🚀 Execute DevOps tasks using DevOps Agent (GPT-4o)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`🚀 DevOps Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processDevOpsTask(task, {
            technologyStack: projectContext.technologyStack,
            cloudProvider: 'AWS',
            environment: 'production',
            scalingRequirements: 'auto-scaling'
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'devops' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '🚀 DevOps implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'devops' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ DevOps task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ DevOps Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3E: Testing Agent Workflow
const testingAgentWorkflow = createWorkflow({
  id: "testing-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-testing-tasks",
  description: "🧪 Execute testing tasks using Testing Agent (Claude Sonnet 4)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`🧪 Testing Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processTestingTask(task, {
            technologyStack: projectContext.technologyStack,
            testingFramework: 'Jest',
            coverageTarget: 80,
            performanceRequirements: 'standard'
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'testing' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '🧪 Testing implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'testing' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Testing task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Testing Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3F: Documentation Agent Workflow
const documentationAgentWorkflow = createWorkflow({
  id: "documentation-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-documentation-tasks",
  description: "📚 Execute documentation tasks using Documentation Agent (Claude Sonnet 4)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`📚 Documentation Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processDocumentationTask(task, {
            technologyStack: projectContext.technologyStack,
            audience: ['developers', 'users'],
            documentationType: 'technical',
            existingDocs: []
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'documentation' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '📚 Documentation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'documentation' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Documentation task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Documentation Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 3G: Integration Agent Workflow
const integrationAgentWorkflow = createWorkflow({
  id: "integration-agent-execution",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  })
})
.then(createStep({
  id: "execute-integration-tasks",
  description: "🔌 Execute integration tasks using Integration Agent (GPT-4o)",
  inputSchema: z.object({
    tasks: z.array(taskSchema),
    projectContext: projectContextSchema
  }),
  outputSchema: z.object({
    results: z.array(taskExecutionResultSchema)
  }),
  execute: async ({ inputData }) => {
    const { tasks, projectContext } = inputData;
    
    if (tasks.length === 0) {
      return { results: [] };
    }
    
    console.log(`🔌 Integration Agent executing ${tasks.length} tasks...`);
    
    const results = await Promise.all(
      tasks.map(async (task: any) => {
        const startTime = Date.now();
        try {
          const result = await processIntegrationTask(task, {
            technologyStack: projectContext.technologyStack,
            integrationType: 'api',
            dataVolume: 'medium',
            securityRequirements: ['authentication', 'encryption']
          });
          
          return {
            taskId: task.id,
            title: task.title,
            category: 'integration' as const,
            status: 'completed' as const,
            artifact: result.artifacts,
            executionTime: Date.now() - startTime,
            message: '🔌 Integration implementation completed successfully'
          };
        } catch (error) {
          return {
            taskId: task.id,
            title: task.title,
            category: 'integration' as const,
            status: 'failed' as const,
            executionTime: Date.now() - startTime,
            message: `❌ Integration task failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'completed').length;
    console.log(`✅ Integration Agent complete: ${successful}/${results.length} tasks successful`);
    
    return { results };
  }
}))
.commit();

// PHASE 4: Artifact Publishing Workflow
const artifactPublishingWorkflow = createWorkflow({
  id: "artifact-publishing",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    allTasks: z.array(taskSchema),
    allResults: z.array(taskExecutionResultSchema)
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
  })
})
.then(createStep({
  id: "publish-all-artifacts",
  description: "📤 Publish all generated artifacts back to GitHub",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    allTasks: z.array(taskSchema),
    allResults: z.array(taskExecutionResultSchema)
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
    const { owner, repo, allTasks, allResults } = inputData;
    
    console.log(`📤 Publishing ${allResults.length} artifacts to GitHub...`);
    
    const publishResults = await Promise.all(
      allResults.map(async (result: any) => {
        if (result.status !== 'completed' || !result.artifact) {
          return {
            taskId: result.taskId,
            category: result.category,
            success: false,
            message: 'No artifact to publish'
          };
        }
        
        try {
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
          const task = allTasks.find((t: any) => t.id === result.taskId);
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
      totalTasks: allResults.length,
      successful: allResults.filter((r: any) => r.status === 'completed').length,
      failed: allResults.filter((r: any) => r.status === 'failed').length,
      published: publishResults.filter((r: any) => r.success).length
    };
    
    console.log(`✅ Artifact publishing complete: ${summary.published}/${summary.totalTasks} published`);
    
    return { publishResults, summary };
  }
}))
.commit();

// MAIN PRODUCTION WORKFLOW - Orchestrates all phases with parallel agent execution
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
    taskDistribution: z.object({
      designTasks: z.number(),
      frontendTasks: z.number(),
      backendTasks: z.number(),
      devopsTasks: z.number(),
      testingTasks: z.number(),
      documentationTasks: z.number(),
      integrationTasks: z.number()
    }),
    executionResults: z.object({
      designResults: z.array(taskExecutionResultSchema),
      frontendResults: z.array(taskExecutionResultSchema),
      backendResults: z.array(taskExecutionResultSchema),
      devopsResults: z.array(taskExecutionResultSchema),
      testingResults: z.array(taskExecutionResultSchema),
      documentationResults: z.array(taskExecutionResultSchema),
      integrationResults: z.array(taskExecutionResultSchema)
    }),
    publishSummary: z.object({
      totalTasks: z.number(),
      successful: z.number(),
      failed: z.number(),
      published: z.number()
    })
  })
})
.then(createStep({
  id: "orchestrate-production-workflow",
  description: "🎭 Orchestrate the complete AI production workflow with parallel agent execution",
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
    taskDistribution: z.object({
      designTasks: z.number(),
      frontendTasks: z.number(),
      backendTasks: z.number(),
      devopsTasks: z.number(),
      testingTasks: z.number(),
      documentationTasks: z.number(),
      integrationTasks: z.number()
    }),
    executionResults: z.object({
      designResults: z.array(taskExecutionResultSchema),
      frontendResults: z.array(taskExecutionResultSchema),
      backendResults: z.array(taskExecutionResultSchema),
      devopsResults: z.array(taskExecutionResultSchema),
      testingResults: z.array(taskExecutionResultSchema),
      documentationResults: z.array(taskExecutionResultSchema),
      integrationResults: z.array(taskExecutionResultSchema)
    }),
    publishSummary: z.object({
      totalTasks: z.number(),
      successful: z.number(),
      failed: z.number(),
      published: z.number()
    })
  }),
  execute: async ({ inputData, mastra }) => {
    console.log(`🎭 Starting Production AI Workflow orchestration...`);
    
    // Phase 1: Analysis and BRD Generation
    console.log(`📋 Phase 1: Analysis and BRD Generation`);
    const brdResult = await mastra.getWorkflow('analyze-and-generate-brd').execute(inputData);
    
    // Phase 2: Task Breakdown and Distribution
    console.log(`📋 Phase 2: Task Breakdown and Distribution`);
    const taskDistribution = await mastra.getWorkflow('task-breakdown-and-distribution').execute({
      owner: brdResult.owner,
      repo: brdResult.repo,
      projectContext: brdResult.projectContext,
      executionConfig: brdResult.executionConfig,
      brd: brdResult.brd
    });
    
    if (!brdResult.executionConfig.enableTaskExecution) {
      console.log(`⏭️ Task execution disabled, skipping agent execution phases`);
      return {
        analysis: brdResult.analysis,
        brd: brdResult.brd,
        brdPosted: brdResult.brdPosted,
        taskDistribution: {
          designTasks: 0,
          frontendTasks: 0,
          backendTasks: 0,
          devopsTasks: 0,
          testingTasks: 0,
          documentationTasks: 0,
          integrationTasks: 0
        },
        executionResults: {
          designResults: [],
          frontendResults: [],
          backendResults: [],
          devopsResults: [],
          testingResults: [],
          documentationResults: [],
          integrationResults: []
        },
        publishSummary: {
          totalTasks: 0,
          successful: 0,
          failed: 0,
          published: 0
        }
      };
    }
    
    // Phase 3: Parallel Agent Execution
    console.log(`📋 Phase 3: Parallel Specialized Agent Execution`);
    const agentExecutionPromises = [];
    
    // Launch all agent workflows in parallel
    if (taskDistribution.designTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('design-agent-execution').execute({
          tasks: taskDistribution.designTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'design', ...result }))
      );
    }
    
    if (taskDistribution.frontendTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('frontend-agent-execution').execute({
          tasks: taskDistribution.frontendTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'frontend', ...result }))
      );
    }
    
    if (taskDistribution.backendTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('backend-agent-execution').execute({
          tasks: taskDistribution.backendTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'backend', ...result }))
      );
    }
    
    if (taskDistribution.devopsTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('devops-agent-execution').execute({
          tasks: taskDistribution.devopsTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'devops', ...result }))
      );
    }
    
    if (taskDistribution.testingTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('testing-agent-execution').execute({
          tasks: taskDistribution.testingTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'testing', ...result }))
      );
    }
    
    if (taskDistribution.documentationTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('documentation-agent-execution').execute({
          tasks: taskDistribution.documentationTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'documentation', ...result }))
      );
    }
    
    if (taskDistribution.integrationTasks.length > 0) {
      agentExecutionPromises.push(
        mastra.getWorkflow('integration-agent-execution').execute({
          tasks: taskDistribution.integrationTasks,
          projectContext: taskDistribution.projectContext
        }).then(result => ({ type: 'integration', ...result }))
      );
    }
    
    // Wait for all agent executions to complete
    const agentResults = await Promise.allSettled(agentExecutionPromises);
    
    // Organize results by agent type
    const executionResults = {
      designResults: [],
      frontendResults: [],
      backendResults: [],
      devopsResults: [],
      testingResults: [],
      documentationResults: [],
      integrationResults: []
    } as any;
    
    agentResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { type, results } = result.value as any;
        executionResults[`${type}Results`] = results;
      } else {
        console.error(`❌ Agent execution failed:`, result.reason);
      }
    });
    
    // Phase 4: Artifact Publishing
    console.log(`📋 Phase 4: Artifact Publishing`);
    const allTasks = [
      ...taskDistribution.designTasks,
      ...taskDistribution.frontendTasks,
      ...taskDistribution.backendTasks,
      ...taskDistribution.devopsTasks,
      ...taskDistribution.testingTasks,
      ...taskDistribution.documentationTasks,
      ...taskDistribution.integrationTasks
    ];
    
    const allResults = [
      ...executionResults.designResults,
      ...executionResults.frontendResults,
      ...executionResults.backendResults,
      ...executionResults.devopsResults,
      ...executionResults.testingResults,
      ...executionResults.documentationResults,
      ...executionResults.integrationResults
    ];
    
    const publishResult = await mastra.getWorkflow('artifact-publishing').execute({
      owner: taskDistribution.owner,
      repo: taskDistribution.repo,
      allTasks,
      allResults
    });
    
    console.log(`🎉 Production AI Workflow orchestration complete!`);
    
    return {
      analysis: brdResult.analysis,
      brd: brdResult.brd,
      brdPosted: brdResult.brdPosted,
      taskDistribution: {
        designTasks: taskDistribution.designTasks.length,
        frontendTasks: taskDistribution.frontendTasks.length,
        backendTasks: taskDistribution.backendTasks.length,
        devopsTasks: taskDistribution.devopsTasks.length,
        testingTasks: taskDistribution.testingTasks.length,
        documentationTasks: taskDistribution.documentationTasks.length,
        integrationTasks: taskDistribution.integrationTasks.length
      },
      executionResults,
      publishSummary: publishResult.summary
    };
  }
}))
.commit();

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

// Export all workflows for individual use
export {
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