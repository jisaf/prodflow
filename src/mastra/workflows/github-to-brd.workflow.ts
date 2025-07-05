import { createWorkflow, createStep } from "@mastra/core";
import { z } from "zod";
import { githubIssuesTool } from "../tools/github-issues.tool";
import { generateBRD, postBRDToGitHub, postTasksToGitHub } from "../agents/brd-generator.agent";
import { breakdownBRDIntoTasks, validateTaskBreakdown } from "../agents/task-master.agent";
import { executeTaskBatch } from "../agents/task-executor.agent";

// Workflow Input/Output Schemas
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
    constraints: z.array(z.string()).optional()
  }).describe("Additional project context for the BRD"),
  postToGitHub: z.object({
    enabled: z.boolean().default(true).describe("Whether to post the BRD back to GitHub issues"),
    issueNumbers: z.array(z.number()).optional().describe("Specific issue numbers to post the BRD to. If not provided, will post to all analyzed issues")
  }).default({ enabled: true }).describe("Configuration for posting BRD back to GitHub"),
  taskBreakdown: z.object({
    enabled: z.boolean().default(true).describe("Whether to generate task breakdown from the BRD"),
    technologyStack: z.array(z.string()).describe("Technology stack for the project (e.g., React, Node.js, PostgreSQL)"),
    executionMode: z.string().default("autonomous").describe("AI execution mode (autonomous, assisted, etc.)"),
    requiredCapabilities: z.array(z.string()).optional().describe("Required AI capabilities for task execution"),
    technicalConstraints: z.array(z.string()).optional().describe("Technical constraints and limitations"),
    postTasksToGitHub: z.boolean().default(true).describe("Whether to post generated tasks back to GitHub issues")
  }).default({ 
    enabled: true, 
    technologyStack: ["JavaScript", "Node.js", "React"], 
    executionMode: "autonomous",
    postTasksToGitHub: true 
  }).describe("Configuration for AI-driven task breakdown generation"),
  taskExecution: z.object({
    enabled: z.boolean().default(true).describe("Whether to execute tasks automatically with specialized agents"),
    maxConcurrentTasks: z.number().min(1).max(20).default(5).describe("Maximum number of tasks to execute concurrently"),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional().describe("Task categories to execute (if not provided, executes all)"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Minimum priority level for execution"),
    autoCommit: z.boolean().default(false).describe("Whether to automatically commit code artifacts to repository")
  }).default({
    enabled: true,
    maxConcurrentTasks: 5,
    autoCommit: false
  }).describe("Configuration for automated task execution by specialized agents")
});

const workflowOutputSchema = z.object({
  brd: z.string().describe("Generated Business Requirements Document"),
  issuesSummary: z.object({
    totalIssues: z.number(),
    openIssues: z.number(),
    closedIssues: z.number(),
    topLabels: z.array(z.string()),
    repositoryInfo: z.object({
      name: z.string(),
      fullName: z.string(),
      description: z.string().nullable()
    })
  }),
  metadata: z.object({
    generatedAt: z.string(),
    githubRepository: z.string(),
    analysisScope: z.string()
  }),
  githubPostResults: z.array(z.object({
    issueNumber: z.number(),
    success: z.boolean(),
    message: z.string(),
    commentUrl: z.string().optional()
  })).optional().describe("Results of posting BRD to GitHub issues"),
  taskBreakdown: z.object({
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "research"]),
      priority: z.enum(["high", "medium", "low"]),
      estimatedHours: z.number(),
      skillLevel: z.enum(["junior", "mid", "senior"]),
      dependencies: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
      phase: z.number(),
      canStartInParallel: z.boolean()
    })),
    summary: z.object({
      totalTasks: z.number(),
      totalHours: z.number(),
      tasksByCategory: z.record(z.number()),
      criticalPath: z.array(z.string()),
      phases: z.number()
    }),
    executionPlan: z.object({
      phases: z.array(z.object({
        phase: z.number(),
        tasks: z.array(z.string()),
        estimatedHours: z.number(),
        description: z.string()
      })),
      totalPhases: z.number(),
      estimatedDuration: z.string()
    }),
    recommendations: z.array(z.string()),
    taskPostResults: z.array(z.object({
      taskId: z.string(),
      taskTitle: z.string(),
      success: z.boolean(),
      message: z.string(),
      issueUrl: z.string().optional(),
      issueNumber: z.number().optional()
    })).optional().describe("Results of posting tasks to GitHub as issues")
  }).optional().describe("Task breakdown and execution plan generated from the BRD"),
  taskExecutionResults: z.object({
    results: z.array(z.object({
      taskId: z.string(),
      title: z.string(),
      category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
      status: z.string(),
      artifactPosted: z.boolean().optional(),
      artifactUrl: z.string().optional(),
      message: z.string()
    })),
    summary: z.string()
  }).optional().describe("Results of automated task execution by specialized agents")
});

// Helper function to analyze issues and extract insights
function analyzeIssues(issues: any[]) {
  const labelCounts = new Map<string, number>();
  const openIssues = issues.filter(i => i.state === 'open').length;
  const closedIssues = issues.filter(i => i.state === 'closed').length;
  
  issues.forEach(issue => {
    issue.labels.forEach((label: any) => {
      labelCounts.set(label.name, (labelCounts.get(label.name) || 0) + 1);
    });
  });
  
  const topLabels = Array.from(labelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label]) => label);
  
  return {
    totalIssues: issues.length,
    openIssues,
    closedIssues,
    topLabels,
    labelDistribution: Object.fromEntries(labelCounts)
  };
}

// Define intermediate schemas for type safety
const fetchIssuesOutputSchema = z.object({
  issuesData: z.any(),
  analysis: z.object({
    totalIssues: z.number(),
    openIssues: z.number(),
    closedIssues: z.number(),
    topLabels: z.array(z.string()),
    labelDistribution: z.record(z.number())
  }),
  projectContext: z.object({
    projectName: z.string(),
    stakeholders: z.array(z.string()),
    businessObjectives: z.array(z.string()),
    constraints: z.array(z.string()).optional()
  }),
  owner: z.string(),
  repo: z.string(),
  postToGitHub: z.object({
    enabled: z.boolean().default(true),
    issueNumbers: z.array(z.number()).optional()
  }).default({ enabled: true }),
  taskBreakdown: z.object({
    enabled: z.boolean().default(true),
    technologyStack: z.array(z.string()),
    executionMode: z.string().default("autonomous"),
    requiredCapabilities: z.array(z.string()).optional(),
    technicalConstraints: z.array(z.string()).optional(),
    postTasksToGitHub: z.boolean().default(false)
  }).default({ 
    enabled: true, 
    technologyStack: ["JavaScript", "Node.js", "React"], 
    executionMode: "autonomous",
    postTasksToGitHub: true 
  }),
  taskExecution: z.object({
    enabled: z.boolean().default(true),
    maxConcurrentTasks: z.number().min(1).max(20).default(5),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    autoCommit: z.boolean().default(false)
  }).default({
    enabled: true,
    maxConcurrentTasks: 5,
    autoCommit: false
  })
});

const generateBRDOutputSchema = z.object({
  brd: z.string(),
  issuesData: z.any(),
  analysis: z.object({
    totalIssues: z.number(),
    openIssues: z.number(),
    closedIssues: z.number(),
    topLabels: z.array(z.string()),
    labelDistribution: z.record(z.number())
  }),
  projectContext: z.object({
    projectName: z.string(),
    stakeholders: z.array(z.string()),
    businessObjectives: z.array(z.string()),
    constraints: z.array(z.string()).optional()
  }),
  owner: z.string(),
  repo: z.string(),
  postToGitHub: z.object({
    enabled: z.boolean().default(true),
    issueNumbers: z.array(z.number()).optional()
  }).default({ enabled: true }),
  taskBreakdown: z.object({
    enabled: z.boolean().default(true),
    technologyStack: z.array(z.string()),
    executionMode: z.string().default("autonomous"),
    requiredCapabilities: z.array(z.string()).optional(),
    technicalConstraints: z.array(z.string()).optional(),
    postTasksToGitHub: z.boolean().default(false)
  }).default({ 
    enabled: true, 
    technologyStack: ["JavaScript", "Node.js", "React"], 
    executionMode: "autonomous",
    postTasksToGitHub: true 
  }),
  taskExecution: z.object({
    enabled: z.boolean().default(true),
    maxConcurrentTasks: z.number().min(1).max(20).default(5),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    autoCommit: z.boolean().default(false)
  }).default({
    enabled: true,
    maxConcurrentTasks: 5,
    autoCommit: false
  })
});

// Step 1: Fetch and analyze GitHub issues
const fetchIssuesStep = createStep({
  id: "fetch-issues",
  description: "Fetch and analyze GitHub issues",
  inputSchema: workflowInputSchema,
  outputSchema: fetchIssuesOutputSchema,
  execute: async ({ inputData }) => {
    const { owner, repo, issueFilters, projectContext, postToGitHub, taskBreakdown, taskExecution } = inputData;
    
    console.log(`Fetching GitHub issues from ${owner}/${repo}...`);
    
    // Provide default values for issueFilters with proper typing
    const state = issueFilters?.state || "open";
    const labels = issueFilters?.labels;
    const assignee = issueFilters?.assignee;
    const limit = issueFilters?.limit || 20;

    // Fetch GitHub issues using the tool (excluding AI-generated issues by default)
    const issuesResult = await githubIssuesTool.execute({
      context: {
        owner,
        repo,
        state,
        labels,
        assignee,
        limit,
        includeAIGenerated: false
      },
      runtimeContext: new Map() as any
    });
    
    const { issues } = issuesResult;
    
    // Analyze the issues
    const analysis = analyzeIssues(issues);
    
    console.log(`Analysis complete: ${analysis.totalIssues} issues processed`);
    console.log(`Top labels: ${analysis.topLabels.slice(0, 5).join(', ')}`);
    
    return {
      issuesData: issuesResult,
      analysis,
      projectContext,
      owner,
      repo,
      postToGitHub,
      taskBreakdown,
      taskExecution
    };
  }
});

// Step 2: Generate BRD using the agent
const generateBRDStep = createStep({
  id: "generate-brd",
  description: "Generate BRD using the agent",
  inputSchema: fetchIssuesOutputSchema,
  outputSchema: generateBRDOutputSchema,
  execute: async ({ inputData }) => {
    const { issuesData, analysis, projectContext, owner, repo, postToGitHub, taskBreakdown, taskExecution } = inputData;
    
    console.log("Generating Business Requirements Document...");
    
    // Generate BRD using the agent
    const brd = await generateBRD(issuesData, projectContext);
    
    console.log("BRD generation complete!");
    
    return {
      brd,
      issuesData,
      analysis,
      projectContext,
      owner,
      repo,
      postToGitHub,
      taskBreakdown,
      taskExecution
    };
  }
});

// Step 3: Break down BRD into tasks (optional)
const taskBreakdownStep = createStep({
  id: "breakdown-brd-into-tasks",
  description: "Break down BRD into discrete tasks",
  inputSchema: generateBRDOutputSchema,
  outputSchema: generateBRDOutputSchema.extend({
    taskBreakdownResults: z.object({
      tasks: z.array(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "research"]),
        priority: z.enum(["high", "medium", "low"]),
        estimatedHours: z.number(),
        skillLevel: z.enum(["junior", "mid", "senior"]),
        dependencies: z.array(z.string()),
        acceptanceCriteria: z.array(z.string()),
        phase: z.number(),
        canStartInParallel: z.boolean()
      })),
      summary: z.object({
        totalTasks: z.number(),
        totalHours: z.number(),
        tasksByCategory: z.record(z.number()),
        criticalPath: z.array(z.string()),
        phases: z.number()
      }),
      executionPlan: z.object({
        phases: z.array(z.object({
          phase: z.number(),
          tasks: z.array(z.string()),
          estimatedHours: z.number(),
          description: z.string()
        })),
        totalPhases: z.number(),
        estimatedDuration: z.string()
      }),
      recommendations: z.array(z.string())
    }).optional()
  }),
  execute: async ({ inputData }) => {
    const { brd, issuesData, analysis, projectContext, owner, repo, postToGitHub, taskBreakdown, taskExecution } = inputData;
    
    let taskBreakdownResults = undefined;
    
    if (taskBreakdown.enabled) {
      console.log("Breaking down BRD into tasks...");
      
      // Create project context for task breakdown
      const taskProjectContext = {
        projectName: projectContext.projectName,
        technology: taskBreakdown.technologyStack,
        executionMode: taskBreakdown.executionMode,
        constraints: taskBreakdown.technicalConstraints
      };
      
      // Break down BRD into tasks
      const taskBreakdownText = await breakdownBRDIntoTasks(brd, taskProjectContext);
      
      // Parse the task breakdown text into structured data
      // This is a simplified parsing - in a real implementation, you'd want more sophisticated parsing
      const lines = taskBreakdownText.split('\n');
      const tasks = [];
      let currentTask = null;
      let taskId = 1;
      
      for (const line of lines) {
        if (line.trim().startsWith('##') || line.trim().startsWith('**Task')) {
          if (currentTask) {
            tasks.push(currentTask);
          }
          // Determine priority based on task title keywords
          const title = line.replace(/[#*]/g, '').trim();
          const titleLower = title.toLowerCase();
          let priority: 'high' | 'medium' | 'low' = 'medium';
          
          if (titleLower.includes('critical') || titleLower.includes('urgent') || titleLower.includes('security')) {
            priority = 'high';
          } else if (titleLower.includes('nice') || titleLower.includes('optional') || titleLower.includes('enhancement')) {
            priority = 'low';
          }
          
          currentTask = {
            id: `task-${taskId++}`,
            title,
            description: '',
            category: 'backend' as const,
            priority,
            estimatedHours: 8,
            skillLevel: 'mid' as const,
            dependencies: [],
            acceptanceCriteria: [],
            phase: 1,
            canStartInParallel: true
          };
        } else if (currentTask && line.trim()) {
          currentTask.description += line.trim() + ' ';
        }
      }
      
      if (currentTask) {
        tasks.push(currentTask);
      }
      
      // Validate and optimize tasks
      const validationConstraints = {
        requiredCapabilities: taskBreakdown.requiredCapabilities,
        technicalConstraints: taskBreakdown.technicalConstraints,
        integrationPoints: [],
        validationRequirements: ['automated-testing', 'code-quality', 'performance']
      };
      
      // Validate and optimize tasks (result currently not used but validates structure)
      await validateTaskBreakdown(
        JSON.stringify(tasks),
        validationConstraints
      );
      
      // Create task breakdown results
      taskBreakdownResults = {
        tasks: tasks,
        summary: {
          totalTasks: tasks.length,
          totalHours: tasks.reduce((sum, task) => sum + task.estimatedHours, 0),
          tasksByCategory: tasks.reduce((acc, task) => {
            acc[task.category] = (acc[task.category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          criticalPath: tasks.filter(t => t.priority === 'high').map(t => t.id),
          phases: Math.max(...tasks.map(t => t.phase))
        },
        executionPlan: {
          phases: [
            {
              phase: 1,
              tasks: tasks.filter(t => t.phase === 1).map(t => t.id),
              estimatedHours: tasks.filter(t => t.phase === 1).reduce((sum, task) => sum + task.estimatedHours, 0),
              description: "Phase 1: Initial AI-driven development"
            }
          ],
          totalPhases: 1,
          estimatedDuration: "Parallel execution optimized for AI agents"
        },
        recommendations: [
          `Total estimated effort: ${tasks.reduce((sum, task) => sum + task.estimatedHours, 0)} hours`,
          `${tasks.length} tasks identified across ${Object.keys(tasks.reduce((acc, task) => {
            acc[task.category] = true;
            return acc;
          }, {} as Record<string, boolean>)).length} categories`
        ],
        taskPostResults: undefined as any
      };
      
      // Post tasks to GitHub if enabled
      let taskPostResults = undefined;
      if (taskBreakdown.postTasksToGitHub && tasks.length > 0) {
        console.log(`Posting ${tasks.length} tasks to GitHub as issues...`);
        
        const taskProjectContext = {
          projectName: projectContext.projectName,
          technologyStack: taskBreakdown.technologyStack
        };
        
        taskPostResults = await postTasksToGitHub(
          tasks,
          owner,
          repo,
          taskProjectContext
        );
        
        const successfulPosts = taskPostResults.filter(r => r.success).length;
        console.log(`Posted ${successfulPosts}/${tasks.length} tasks to GitHub successfully`);
      }
      
      // Update task breakdown results to include post results
      if (taskPostResults) {
        taskBreakdownResults!.taskPostResults = taskPostResults;
      }
      
      console.log(`Task breakdown complete! Generated ${tasks.length} tasks.`);
    } else {
      console.log("Skipping task breakdown (not enabled)");
    }
    
    return {
      brd,
      issuesData,
      analysis,
      projectContext,
      owner,
      repo,
      postToGitHub,
      taskBreakdown,
      taskExecution,
      taskBreakdownResults
    };
  }
});

// Step 4: Execute tasks automatically with specialized agents (optional)
const taskExecutionStep = createStep({
  id: "execute-tasks-automatically",
  description: "Execute tasks automatically using specialized AI agents",
  inputSchema: taskBreakdownStep.outputSchema,
  outputSchema: taskBreakdownStep.outputSchema.extend({
    taskExecutionResults: z.object({
      results: z.array(z.object({
        taskId: z.string(),
        title: z.string(),
        category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
        status: z.string(), // Keep as string to match actual implementation
        artifactPosted: z.boolean().optional(),
        artifactUrl: z.string().optional(),
        message: z.string()
      })),
      summary: z.string()
    }).optional()
  }),
  execute: async ({ inputData }) => {
    const { brd, issuesData, analysis, projectContext, owner, repo, postToGitHub, taskBreakdown, taskExecution, taskBreakdownResults } = inputData;
    
    let taskExecutionResults = undefined;
    
    // Execute tasks if enabled and we have tasks to execute
    if (taskExecution.enabled && taskBreakdownResults && taskBreakdownResults.tasks && taskBreakdownResults.tasks.length > 0) {
      console.log(`Starting automated task execution for ${taskBreakdownResults.tasks.length} tasks...`);
      
      // Create project context for task execution
      const executionProjectContext = {
        technologyStack: taskBreakdown.technologyStack,
        framework: taskBreakdown.technologyStack.find(tech => 
          ['React', 'Vue', 'Angular', 'Svelte'].includes(tech)
        ),
        database: taskBreakdown.technologyStack.find(tech => 
          ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis'].includes(tech)
        ),
        cloudProvider: taskBreakdown.technologyStack.find(tech => 
          ['AWS', 'GCP', 'Azure'].includes(tech)
        )
      };
      
      // Execute tasks using the task executor
      const executionResult = await executeTaskBatch(owner, repo, {
        maxTasks: taskExecution.maxConcurrentTasks,
        categories: taskExecution.categories,
        priority: taskExecution.priority,
        projectContext: executionProjectContext
      });
      
      taskExecutionResults = executionResult;
      
      const successCount = executionResult.results.filter(r => r.status === "completed").length;
      console.log(`Task execution complete: ${successCount}/${executionResult.results.length} tasks successful`);
    } else {
      console.log("Skipping task execution (not enabled or no tasks available)");
    }
    
    return {
      brd,
      issuesData,
      analysis,
      projectContext,
      owner,
      repo,
      postToGitHub,
      taskBreakdown,
      taskExecution,
      taskBreakdownResults,
      taskExecutionResults
    };
  }
});

// Step 5: Post BRD to GitHub (optional)
const postBRDStep = createStep({
  id: "post-brd-to-github",
  description: "Post BRD back to GitHub issues",
  inputSchema: taskExecutionStep.outputSchema,
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData }) => {
    const { brd, issuesData, analysis, projectContext, owner, repo, postToGitHub, taskBreakdownResults, taskExecutionResults } = inputData;
    
    // Extract repository info for result
    const repository = issuesData.repository;
    
    // Build base result
    const result = {
      brd,
      issuesSummary: {
        totalIssues: analysis.totalIssues,
        openIssues: analysis.openIssues,
        closedIssues: analysis.closedIssues,
        topLabels: analysis.topLabels.slice(0, 5), // Top 5 labels
        repositoryInfo: {
          name: repository.name,
          fullName: repository.full_name,
          description: repository.description
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        githubRepository: repository.full_name,
        analysisScope: `${analysis.totalIssues} issues analyzed`
      },
      taskBreakdown: taskBreakdownResults ? {
        tasks: taskBreakdownResults.tasks,
        summary: taskBreakdownResults.summary,
        executionPlan: taskBreakdownResults.executionPlan,
        recommendations: taskBreakdownResults.recommendations,
        taskPostResults: (taskBreakdownResults as any).taskPostResults
      } : undefined,
      taskExecutionResults: taskExecutionResults
    };
    
    // Post to GitHub if enabled
    if (postToGitHub?.enabled) {
      console.log("Posting BRD to GitHub issues...");
      
      // Determine which issues to post to
      let issueNumbers: number[] = postToGitHub.issueNumbers || [];
      if (issueNumbers.length === 0) {
        // Default to all analyzed issues if no specific issues are provided
        if (issuesData.issues && issuesData.issues.length > 0) {
          issueNumbers = issuesData.issues.map((issue: any) => issue.number);
          console.log(`Posting BRD to all ${issueNumbers.length} analyzed issues`);
        } else {
          console.log("No issues found to post BRD to");
          return { ...result, githubPostResults: [] };
        }
      }
      
      // Post BRD to GitHub issues
      const githubPostResults = await postBRDToGitHub(
        brd,
        owner,
        repo,
        issueNumbers,
        projectContext.projectName
      );
      
      console.log(`Posted BRD to ${githubPostResults.length} GitHub issues`);
      
      return { ...result, githubPostResults };
    }
    
    console.log("Skipping GitHub posting (not enabled)");
    return result;
  }
});

// Main Workflow
export const githubToBRDWorkflow = createWorkflow({
  id: "github-issues-to-brd",
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema
})
.then(fetchIssuesStep)
.then(generateBRDStep)
.then(taskBreakdownStep)
.then(taskExecutionStep)
.then(postBRDStep)
.commit();

// Note: To use this workflow, execute it through a Mastra instance
// Example:
// const mastra = new Mastra({ workflows: { githubToBRDWorkflow } });
// const result = await mastra.getWorkflow('github-issues-to-brd').execute({
//   owner: "facebook",
//   repo: "react",
//   projectContext: { ... },
//   issueFilters: { ... },
//   postToGitHub: { enabled: true, issueNumbers: [123, 456] }
// });

// Example usage:
/*
const result = await mastra.getWorkflow('github-issues-to-brd').execute({
  owner: "facebook",
  repo: "react",
  projectContext: {
    projectName: "React Enhancement Initiative",
    stakeholders: ["Product Team", "Engineering Team", "UX Team"],
    businessObjectives: [
      "Improve developer experience",
      "Enhance performance",
      "Increase adoption"
    ],
    constraints: ["Backward compatibility", "Bundle size limits"]
  },
  issueFilters: {
    state: "open",
    labels: ["enhancement", "bug"],
    limit: 25
  },
  postToGitHub: {
    enabled: true,
    issueNumbers: [123, 456] // Optional: specific issues to post to
  }
});

console.log("Generated BRD:", result.brd);
console.log("Issues Summary:", result.issuesSummary);
console.log("GitHub Post Results:", result.githubPostResults);
*/
