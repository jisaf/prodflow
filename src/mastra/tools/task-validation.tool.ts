import { createTool } from "@mastra/core";
import { z } from "zod";

export const taskValidationTool = createTool({
  id: "validate-tasks",
  description: "Validate AI-executable task breakdown for completeness, dependencies, and technical feasibility",
  inputSchema: z.object({
    tasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "research"]),
      priority: z.enum(["high", "medium", "low"]),
      estimatedHours: z.number(),
      skillLevel: z.enum(["junior", "mid", "senior"]),
      dependencies: z.array(z.string()),
      acceptanceCriteria: z.array(z.string())
    })),
    constraints: z.object({
      requiredCapabilities: z.array(z.string()).optional().describe("Required AI capabilities"),
      technicalConstraints: z.array(z.string()).optional().describe("Technical constraints and limitations"),
      integrationPoints: z.array(z.string()).optional().describe("External integration requirements"),
      performanceRequirements: z.array(z.string()).optional().describe("Performance and scalability requirements")
    }).optional()
  }),
  outputSchema: z.object({
    validationResults: z.object({
      isValid: z.boolean(),
      totalHours: z.number(),
      criticalPath: z.array(z.string()),
      issues: z.array(z.object({
        type: z.enum(["error", "warning", "info"]),
        taskId: z.string().optional(),
        message: z.string(),
        suggestion: z.string().optional()
      })),
      recommendations: z.array(z.string())
    }),
    optimizedTasks: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "research"]),
      priority: z.enum(["high", "medium", "low"]),
      estimatedHours: z.number(),
      skillLevel: z.enum(["junior", "mid", "senior"]),
      dependencies: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
      phase: z.number().describe("Execution phase (1, 2, 3, etc.)"),
      canStartInParallel: z.boolean().describe("Can be started in parallel with other tasks")
    })),
    executionPlan: z.object({
      phases: z.array(z.object({
        phase: z.number(),
        tasks: z.array(z.string()),
        estimatedHours: z.number(),
        description: z.string()
      })),
      totalPhases: z.number(),
      estimatedDuration: z.string()
    })
  }),
  execute: async ({ context }) => {
    const { tasks, constraints } = context;
    
    // Validation results
    const issues: any[] = [];
    const recommendations: string[] = [];
    
    // Calculate total hours
    const totalHours = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    
    // Validate individual tasks
    tasks.forEach(task => {
      // Check technical constraints
      if (constraints?.technicalConstraints && constraints.technicalConstraints.length > 0) {
        const hasConstraintViolation = constraints.technicalConstraints.some(constraint => 
          task.title.toLowerCase().includes(constraint.toLowerCase()) ||
          task.description.toLowerCase().includes(constraint.toLowerCase())
        );
        if (hasConstraintViolation) {
          issues.push({
            type: "warning",
            taskId: task.id,
            message: `Task "${task.title}" may conflict with technical constraints`,
            suggestion: "Review task requirements against technical constraints"
          });
        }
      }
      
      // Check dependencies
      task.dependencies.forEach(depId => {
        const depExists = tasks.some(t => t.id === depId);
        if (!depExists) {
          issues.push({
            type: "error",
            taskId: task.id,
            message: `Task "${task.title}" depends on non-existent task "${depId}"`,
            suggestion: "Remove invalid dependency or add the missing task"
          });
        }
      });
      
      // Check acceptance criteria
      if (task.acceptanceCriteria.length === 0) {
        issues.push({
          type: "warning",
          taskId: task.id,
          message: `Task "${task.title}" has no acceptance criteria`,
          suggestion: "Add specific acceptance criteria for this task"
        });
      }
    });
    
    // Validate AI capabilities
    if (constraints?.requiredCapabilities && constraints.requiredCapabilities.length > 0) {
      const missingCapabilities = constraints.requiredCapabilities.filter(capability => 
        !tasks.some(task => task.title.toLowerCase().includes(capability.toLowerCase()))
      );
      if (missingCapabilities.length > 0) {
        issues.push({
          type: "warning",
          message: `Missing tasks for required capabilities: ${missingCapabilities.join(', ')}`,
          suggestion: "Add tasks to cover all required AI capabilities"
        });
      }
    }
    
    // Check for circular dependencies
    const circularDeps = findCircularDependencies(tasks);
    circularDeps.forEach(cycle => {
      issues.push({
        type: "error",
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        suggestion: "Remove or restructure dependencies to eliminate cycles"
      });
    });
    
    // Calculate critical path
    const criticalPath = calculateCriticalPath(tasks);
    
    // Generate optimized tasks with phases
    const optimizedTasks = optimizeTaskExecution(tasks);
    
    // Generate execution plan
    const executionPlan = generateExecutionPlan(optimizedTasks, constraints);
    
    // Generate recommendations
    generateRecommendations(tasks, constraints, issues, recommendations);
    
    return {
      validationResults: {
        isValid: issues.filter(i => i.type === 'error').length === 0,
        totalHours,
        criticalPath,
        issues,
        recommendations
      },
      optimizedTasks,
      executionPlan
    };
  }
});

// Helper functions
function findCircularDependencies(tasks: any[]): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];
  
  function dfs(taskId: string, path: string[]): void {
    if (recursionStack.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      cycles.push(path.slice(cycleStart).concat(taskId));
      return;
    }
    
    if (visited.has(taskId)) return;
    
    visited.add(taskId);
    recursionStack.add(taskId);
    
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      for (const dep of task.dependencies) {
        dfs(dep, path.concat(taskId));
      }
    }
    
    recursionStack.delete(taskId);
  }
  
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }
  
  return cycles;
}

function calculateCriticalPath(tasks: any[]): string[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const criticalPath: string[] = [];
  
  function calculateTaskDuration(taskId: string): number {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);
    
    const task = taskMap.get(taskId);
    if (!task) return 0;
    
    const maxDepDuration = Math.max(
      0,
      ...task.dependencies.map((dep: string) => calculateTaskDuration(dep))
    );
    
    return maxDepDuration + task.estimatedHours;
  }
  
  // Find tasks with longest path
  let maxDuration = 0;
  let criticalTaskId = '';
  
  for (const task of tasks) {
    visited.clear();
    const duration = calculateTaskDuration(task.id);
    if (duration > maxDuration) {
      maxDuration = duration;
      criticalTaskId = task.id;
    }
  }
  
  // Build critical path
  function buildPath(taskId: string): void {
    const task = taskMap.get(taskId);
    if (!task) return;
    
    criticalPath.unshift(taskId);
    
    if (task.dependencies.length > 0) {
      // Find dependency with longest duration
      let maxDepDuration = 0;
      let criticalDep = '';
      
      for (const dep of task.dependencies) {
        visited.clear();
        const duration = calculateTaskDuration(dep);
        if (duration > maxDepDuration) {
          maxDepDuration = duration;
          criticalDep = dep;
        }
      }
      
      if (criticalDep) {
        buildPath(criticalDep);
      }
    }
  }
  
  if (criticalTaskId) {
    buildPath(criticalTaskId);
  }
  
  return criticalPath;
}

function optimizeTaskExecution(tasks: any[]): any[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const phases = new Map<string, number>();
  const visited = new Set<string>();
  
  function assignPhase(taskId: string): number {
    if (phases.has(taskId)) return phases.get(taskId)!;
    if (visited.has(taskId)) return 1; // Circular dependency fallback
    
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) return 1;
    
    let maxDepPhase = 0;
    for (const dep of task.dependencies) {
      maxDepPhase = Math.max(maxDepPhase, assignPhase(dep));
    }
    
    const phase = maxDepPhase + 1;
    phases.set(taskId, phase);
    visited.delete(taskId);
    
    return phase;
  }
  
  // Assign phases to all tasks
  for (const task of tasks) {
    assignPhase(task.id);
  }
  
  // Create optimized tasks with phase information
  return tasks.map(task => {
    const phase = phases.get(task.id) || 1;
    const samePhaseTasks = tasks.filter(t => phases.get(t.id) === phase);
    
    return {
      ...task,
      phase,
      canStartInParallel: samePhaseTasks.length > 1
    };
  });
}

function generateExecutionPlan(optimizedTasks: any[], constraints: any): any {
  const phaseMap = new Map<number, any[]>();
  
  // Group tasks by phase
  optimizedTasks.forEach(task => {
    const phase = task.phase;
    if (!phaseMap.has(phase)) {
      phaseMap.set(phase, []);
    }
    phaseMap.get(phase)!.push(task);
  });
  
  // Calculate phase details
  const phases = Array.from(phaseMap.entries()).map(([phaseNum, tasks]) => {
    const estimatedHours = Math.max(...tasks.map(t => t.estimatedHours));
    const taskIds = tasks.map(t => t.id);
    
    let description = `Phase ${phaseNum}: `;
    const categories = [...new Set(tasks.map(t => t.category))];
    description += categories.join(', ');
    
    return {
      phase: phaseNum,
      tasks: taskIds,
      estimatedHours,
      description
    };
  });
  
  // Estimate duration based on team size and parallel work
  const teamSize = constraints?.teamSize || 1;
  const totalParallelHours = phases.reduce((sum, phase) => sum + phase.estimatedHours, 0);
  const estimatedDays = Math.ceil(totalParallelHours / (teamSize * 8)); // 8 hours per day
  
  return {
    phases,
    totalPhases: phases.length,
    estimatedDuration: `${estimatedDays} days`
  };
}

function generateRecommendations(tasks: any[], _constraints: any, _issues: any[], recommendations: string[]): void {
  // Task size recommendations
  const largeTasks = tasks.filter(t => t.estimatedHours > 16);
  if (largeTasks.length > 0) {
    recommendations.push(`Consider breaking down ${largeTasks.length} large tasks (>16 hours) into smaller chunks`);
  }
  
  // Skill level distribution
  const skillDistribution = tasks.reduce((acc, task) => {
    acc[task.skillLevel] = (acc[task.skillLevel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  if (skillDistribution.senior > skillDistribution.junior + skillDistribution.mid) {
    recommendations.push("Consider delegating some tasks to junior/mid-level developers");
  }
  
  // Parallel work opportunities
  const parallelTasks = tasks.filter(t => t.dependencies.length === 0);
  if (parallelTasks.length > 1) {
    recommendations.push(`${parallelTasks.length} tasks can be started in parallel`);
  }
  
  // Testing recommendations
  const testingTasks = tasks.filter(t => t.category === 'testing');
  const developmentTasks = tasks.filter(t => ['frontend', 'backend'].includes(t.category));
  if (testingTasks.length < developmentTasks.length * 0.3) {
    recommendations.push("Consider adding more testing tasks to ensure quality");
  }
  
  // Documentation recommendations
  const docTasks = tasks.filter(t => t.category === 'documentation');
  if (docTasks.length === 0) {
    recommendations.push("Consider adding documentation tasks for better maintainability");
  }
}