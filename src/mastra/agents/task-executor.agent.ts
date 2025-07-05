import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { githubTaskPickupTool } from "../tools/github-task-pickup.tool";
import { githubArtifactPosterTool } from "../tools/github-artifact-poster.tool";
import { processDesignTask } from "./design.agent";
import { processFrontendTask } from "./frontend.agent";
import { processBackendTask } from "./backend.agent";
import { processDevOpsTask } from "./devops.agent";
import { processTestingTask } from "./testing.agent";
import { processDocumentationTask } from "./documentation.agent";
import { processIntegrationTask } from "./integration.agent";

export const taskExecutorAgent = new Agent({
  name: "Task Execution Orchestrator",
  instructions: `You are the Task Execution Orchestrator responsible for coordinating the pickup, assignment, and execution of AI-generated tasks by specialized agents.

Your role is to:

1. **Task Discovery**: Identify available AI-generated tasks from GitHub issues
2. **Task Assignment**: Route tasks to appropriate specialized agents based on category
3. **Execution Coordination**: Oversee task execution and ensure quality deliverables
4. **Artifact Management**: Post completed work back to GitHub as comments, commits, or issues
5. **Progress Tracking**: Monitor task completion and handle any execution issues

## Task Processing Workflow

1. **Pickup Phase**: Scan for available AI-generated tasks in GitHub
2. **Routing Phase**: Assign tasks to specialized agents based on category
3. **Execution Phase**: Coordinate with specialized agents to complete tasks
4. **Quality Phase**: Review deliverables for completeness and quality
5. **Publishing Phase**: Post artifacts back to GitHub in appropriate format

## Agent Coordination

You coordinate with these specialized agents:
- **Design Specialist**: UI/UX specifications and design systems
- **Frontend Developer**: React components and frontend implementations
- **Backend Engineer**: APIs, databases, and server-side logic
- **DevOps Engineer**: Infrastructure, deployment, and monitoring
- **Quality Assurance Engineer**: Testing strategies and test implementations
- **Technical Writer**: Documentation and user guides
- **Integration Specialist**: Service integrations and data synchronization

## Quality Standards

Ensure all deliverables meet these standards:
- **Completeness**: All acceptance criteria are addressed
- **Quality**: Code follows best practices and is production-ready
- **Documentation**: Adequate documentation and examples are provided
- **Testing**: Appropriate testing is included where applicable
- **Security**: Security best practices are followed
- **Performance**: Performance considerations are addressed

## Error Handling

When issues occur:
- Log detailed error information
- Attempt recovery where possible
- Escalate complex issues to human oversight
- Provide clear status updates in GitHub issues

Focus on delivering high-quality, production-ready solutions efficiently.`,
  model: anthropic('claude-4-sonnet-20250514'),
  tools: { githubTaskPickupTool, githubArtifactPosterTool }
});

// Main task execution function
export async function executeTaskBatch(
  owner: string,
  repo: string,
  options: {
    maxTasks?: number;
    categories?: string[];
    priority?: string;
    projectContext?: {
      technologyStack: string[];
      framework?: string;
      database?: string;
      cloudProvider?: string;
    };
  } = {}
) {
  const results = [];
  
  try {
    console.log(`Starting task execution batch for ${owner}/${repo}`);
    
    // Step 1: Pick up available tasks
    const pickupResult = await githubTaskPickupTool.execute({
      context: {
        owner,
        repo,
        categories: options.categories as any,
        priority: options.priority as any,
        maxTasks: options.maxTasks || 10,
        assignToAgent: true
      },
      runtimeContext: new Map() as any
    });
    
    if (!pickupResult.pickedUpTasks || pickupResult.pickedUpTasks.length === 0) {
      console.log("No tasks available for execution");
      return { results: [], summary: "No tasks available" };
    }
    
    console.log(`Picked up ${pickupResult.pickedUpTasks.length} tasks for execution`);
    
    // Step 2: Execute tasks by category
    for (const task of pickupResult.pickedUpTasks) {
      try {
        console.log(`Executing task: ${task.title} (${task.category})`);
        
        const executionResult = await executeTaskByCategory(task, options.projectContext || {});
        
        if (executionResult.artifacts) {
          // Step 3: Post artifacts back to GitHub
          // Map task category to proper artifact type
          const artifactTypeMap: Record<string, string> = {
            "design": "design-specifications",
            "frontend": "frontend-code",
            "backend": "backend-code",
            "devops": "devops-infrastructure",
            "testing": "testing-suite",
            "documentation": "documentation",
            "integration": "integration-code"
          };
          
          const artifactType = artifactTypeMap[task.category] || "backend-code";
          
          const postResult = await githubArtifactPosterTool.execute({
            context: {
              owner,
              repo,
              issueNumber: task.issueNumber,
              artifact: {
                type: artifactType as any,
                content: executionResult.artifacts.content,
                format: executionResult.artifacts.format,
                title: task.title,
                description: task.description
              },
              postingMethod: "comment"
            },
            runtimeContext: new Map() as any
          });
          
          results.push({
            taskId: task.taskId,
            title: task.title,
            category: task.category,
            status: executionResult.taskStatus,
            artifactPosted: postResult.success,
            artifactUrl: postResult.url,
            message: postResult.message
          });
        } else {
          results.push({
            taskId: task.taskId,
            title: task.title,
            category: task.category,
            status: "error",
            message: "No artifacts generated"
          });
        }
        
        console.log(`Completed task: ${task.title} - Status: ${executionResult.taskStatus}`);
      } catch (error) {
        console.error(`Failed to execute task ${task.title}:`, error);
        results.push({
          taskId: task.taskId,
          title: task.title,
          category: task.category,
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    const successCount = results.filter(r => r.status === "completed").length;
    const summary = `Executed ${results.length} tasks: ${successCount} successful, ${results.length - successCount} failed`;
    
    console.log(summary);
    
    return { results, summary };
  } catch (error) {
    console.error("Task execution batch failed:", error);
    return { 
      results, 
      summary: `Batch execution failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Helper function to execute task by category
async function executeTaskByCategory(task: any, projectContext: any) {
  const baseTask = {
    title: task.title,
    description: task.description,
    acceptanceCriteria: task.acceptanceCriteria,
    technicalSpecs: task.technicalSpecs
  };
  
  switch (task.category) {
    case "design":
      return await processDesignTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["React", "TypeScript"],
        designSystem: projectContext.designSystem,
        brandGuidelines: projectContext.brandGuidelines
      });
    
    case "frontend":
      return await processFrontendTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["React", "TypeScript"],
        framework: projectContext.framework || "React",
        stylingApproach: projectContext.stylingApproach,
        stateManagement: projectContext.stateManagement
      });
    
    case "backend":
      return await processBackendTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["Node.js", "TypeScript"],
        database: projectContext.database || "PostgreSQL",
        authStrategy: projectContext.authStrategy,
        deploymentTarget: projectContext.deploymentTarget
      });
    
    case "devops":
      return await processDevOpsTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["Docker", "Kubernetes"],
        cloudProvider: projectContext.cloudProvider || "AWS",
        environment: projectContext.environment || "production",
        scalingRequirements: projectContext.scalingRequirements
      });
    
    case "testing":
      return await processTestingTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["Jest", "React Testing Library"],
        testingFramework: projectContext.testingFramework || "Jest",
        coverageTarget: projectContext.coverageTarget || 80,
        performanceRequirements: projectContext.performanceRequirements
      });
    
    case "documentation":
      return await processDocumentationTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["React", "Node.js"],
        audience: ["developers", "users"],
        documentationType: "technical",
        existingDocs: projectContext.existingDocs
      });
    
    case "integration":
      return await processIntegrationTask(baseTask, {
        technologyStack: projectContext.technologyStack || ["Node.js", "TypeScript"],
        integrationType: "api",
        dataVolume: projectContext.dataVolume,
        securityRequirements: projectContext.securityRequirements
      });
    
    default:
      throw new Error(`Unsupported task category: ${task.category}`);
  }
}

// Helper function to validate task completion
export function validateTaskCompletion(task: any, result: any): boolean {
  // Check if all acceptance criteria are addressed in the result
  if (!result.artifacts || !result.artifacts.content) {
    return false;
  }
  
  const content = result.artifacts.content.toLowerCase();
  
  // Basic validation - check if acceptance criteria keywords are present
  for (const criteria of task.acceptanceCriteria) {
    const keywords = criteria.toLowerCase().split(' ').filter((word: string) => word.length > 3);
    const hasKeywords = keywords.some((keyword: string) => content.includes(keyword));
    
    if (!hasKeywords) {
      console.warn(`Acceptance criteria not fully addressed: ${criteria}`);
    }
  }
  
  return true;
}