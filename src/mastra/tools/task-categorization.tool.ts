import { createTool } from "@mastra/core";
import { z } from "zod";

export const taskCategorizationTool = createTool({
  id: "categorize-tasks",
  description: "Categorize tasks for AI agent execution and provide structured task information",
  inputSchema: z.object({
    tasks: z.array(z.object({
      title: z.string().describe("Task title"),
      description: z.string().describe("Task description"),
      category: z.enum([
        "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
      ]).optional().describe("Task category"),
      priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Task priority"),
      complexity: z.enum(["simple", "moderate", "complex"]).optional().describe("Technical complexity"),
      aiCapability: z.enum(["code-generation", "testing", "deployment", "analysis"]).optional().describe("Required AI capability"),
      dependencies: z.array(z.string()).optional().describe("Task dependencies")
    })),
    projectType: z.string().describe("Type of project (web app, mobile app, API, etc.)"),
    technologyStack: z.array(z.string()).describe("Technology stack being used"),
    executionMode: z.string().describe("AI execution mode (autonomous, assisted, etc.)")
  }),
  outputSchema: z.object({
    categorizedTasks: z.array(z.object({
      id: z.string().describe("Unique task identifier"),
      title: z.string().describe("Task title"),
      description: z.string().describe("Task description"),
      category: z.enum([
        "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
      ]).describe("Task category"),
      priority: z.enum(["critical", "high", "medium", "low"]).describe("Task priority"),
      complexity: z.enum(["simple", "moderate", "complex"]).describe("Technical complexity"),
      aiCapability: z.enum(["code-generation", "testing", "deployment", "analysis"]).describe("Required AI capability"),
      dependencies: z.array(z.string()).describe("Task dependencies"),
      acceptanceCriteria: z.array(z.string()).describe("Acceptance criteria for task completion"),
      technicalSpecs: z.string().optional().describe("Technical specifications and requirements"),
      validationMethod: z.string().describe("How to validate task completion"),
      parallelizable: z.boolean().describe("Can this task run in parallel with others")
    })),
    taskSummary: z.object({
      totalTasks: z.number(),
      tasksByCategory: z.record(z.number()),
      complexityDistribution: z.record(z.number()),
      criticalPathTasks: z.array(z.string()).describe("Tasks on the critical path"),
      parallelizableTasks: z.array(z.string()).describe("Tasks that can run in parallel")
    }),
    recommendations: z.array(z.string()).describe("Recommendations for AI agent execution")
  }),
  execute: async ({ context }) => {
    const { tasks, projectType, technologyStack, executionMode } = context;
    
    // Generate unique IDs for tasks
    const categorizedTasks = tasks.map((task, index) => {
      const taskId = `${task.category || 'misc'}-${index + 1}`;
      
      // Auto-categorize if not provided
      let category = task.category;
      if (!category) {
        category = inferCategory(task.title, task.description, technologyStack) as any;
      }
      
      // Auto-assign complexity if not provided
      let complexity = task.complexity;
      if (!complexity) {
        complexity = inferComplexity(task.title, task.description, category || 'backend') as any;
      }
      
      // Auto-assign AI capability if not provided
      let aiCapability = task.aiCapability;
      if (!aiCapability) {
        aiCapability = inferAICapability(task.title, task.description, category || 'backend') as any;
      }
      
      // Generate acceptance criteria
      const acceptanceCriteria = generateAcceptanceCriteria(task.title, task.description, category || 'backend');
      
      // Generate technical specifications
      const technicalSpecs = generateTechnicalSpecs(task.title, task.description, technologyStack);
      
      // Generate validation method
      const validationMethod = generateValidationMethod(task.title, task.description, category || 'backend');
      
      // Determine if task is parallelizable
      const parallelizable = isParallelizable(task.title, task.description, category || 'backend');
      
      return {
        id: taskId,
        title: task.title,
        description: task.description,
        category: category as any,
        priority: task.priority || inferPriority(task.title, task.description, category || 'backend') as any,
        complexity: complexity as any,
        aiCapability: aiCapability as any,
        dependencies: task.dependencies || [],
        acceptanceCriteria,
        technicalSpecs,
        validationMethod,
        parallelizable
      };
    });
    
    // Calculate task summary
    const tasksByCategory = categorizedTasks.reduce((acc, task) => {
      acc[task.category] = (acc[task.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const complexityDistribution = categorizedTasks.reduce((acc, task) => {
      acc[task.complexity] = (acc[task.complexity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Identify critical path tasks (simplified logic)
    const criticalPathTasks = categorizedTasks
      .filter(task => task.priority === 'critical' || task.priority === 'high' || task.dependencies.length > 0)
      .map(task => task.id);
    
    // Identify parallelizable tasks
    const parallelizableTasks = categorizedTasks
      .filter(task => task.parallelizable && task.dependencies.length === 0)
      .map(task => task.id);
    
    // Generate recommendations for AI execution
    const recommendations = generateAIRecommendations(categorizedTasks, projectType, technologyStack, executionMode);
    
    return {
      categorizedTasks,
      taskSummary: {
        totalTasks: categorizedTasks.length,
        tasksByCategory,
        complexityDistribution,
        criticalPathTasks,
        parallelizableTasks
      },
      recommendations
    };
  }
});

// Helper functions for AI-focused task categorization
function inferCategory(title: string, description: string, technologyStack: string[]): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('ui') || text.includes('design') || text.includes('wireframe') || text.includes('mockup') || text.includes('schema')) {
    return 'design';
  }
  if (text.includes('component') || text.includes('frontend') || text.includes('react') || text.includes('vue') || text.includes('client')) {
    return 'frontend';
  }
  if (text.includes('api') || text.includes('backend') || text.includes('database') || text.includes('server') || text.includes('service')) {
    return 'backend';
  }
  if (text.includes('deploy') || text.includes('ci/cd') || text.includes('docker') || text.includes('kubernetes') || text.includes('pipeline')) {
    return 'devops';
  }
  if (text.includes('test') || text.includes('testing') || text.includes('spec') || text.includes('validation')) {
    return 'testing';
  }
  if (text.includes('document') || text.includes('readme') || text.includes('guide') || text.includes('spec')) {
    return 'documentation';
  }
  if (text.includes('integration') || text.includes('connect') || text.includes('sync') || text.includes('webhook')) {
    return 'integration';
  }
  
  return 'backend'; // default
}

function inferComplexity(title: string, description: string, category: string): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('simple') || text.includes('basic') || text.includes('straightforward') || text.includes('single')) {
    return 'simple';
  }
  if (text.includes('complex') || text.includes('advanced') || text.includes('sophisticated') || text.includes('multi')) {
    return 'complex';
  }
  if (text.includes('system') || text.includes('architecture') || text.includes('integration') || text.includes('performance')) {
    return 'complex';
  }
  
  return 'moderate'; // default
}

function inferAICapability(title: string, description: string, category: string): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('implement') || text.includes('create') || text.includes('build') || text.includes('develop')) {
    return 'code-generation';
  }
  if (text.includes('test') || text.includes('validate') || text.includes('verify') || text.includes('check')) {
    return 'testing';
  }
  if (text.includes('deploy') || text.includes('release') || text.includes('publish') || text.includes('configure')) {
    return 'deployment';
  }
  if (text.includes('analyze') || text.includes('review') || text.includes('audit') || text.includes('assess')) {
    return 'analysis';
  }
  
  // Default by category
  const categoryDefaults = {
    design: 'analysis',
    frontend: 'code-generation',
    backend: 'code-generation',
    devops: 'deployment',
    testing: 'testing',
    documentation: 'analysis',
    integration: 'code-generation'
  };
  
  return categoryDefaults[category as keyof typeof categoryDefaults] || 'code-generation';
}

function isParallelizable(title: string, description: string, category: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  
  // Tasks that typically require sequential execution
  if (text.includes('depends') || text.includes('after') || text.includes('following') || text.includes('migration')) {
    return false;
  }
  
  // Tasks that are typically parallelizable
  if (text.includes('component') || text.includes('test') || text.includes('documentation') || text.includes('style')) {
    return true;
  }
  
  // Category-based defaults
  const categoryDefaults = {
    design: true,
    frontend: true,
    backend: false, // Often has dependencies
    devops: false,  // Often sequential
    testing: true,
    documentation: true,
    integration: false // Often depends on other systems
  };
  
  return categoryDefaults[category as keyof typeof categoryDefaults] || false;
}

function inferPriority(title: string, description: string, category: string): string {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('critical') || text.includes('security') || text.includes('blocking') || text.includes('urgent')) {
    return 'critical';
  }
  if (text.includes('important') || text.includes('required') || text.includes('core') || text.includes('essential')) {
    return 'high';
  }
  if (text.includes('nice to have') || text.includes('optional') || text.includes('enhancement') || text.includes('future')) {
    return 'low';
  }
  
  return 'medium';
}

function generateAcceptanceCriteria(title: string, description: string, category: string): string[] {
  const criteria = [];
  
  switch (category) {
    case 'design':
      criteria.push('Design specifications are technically complete');
      criteria.push('Component schemas are defined and validated');
      criteria.push('Design system consistency is maintained');
      break;
    case 'frontend':
      criteria.push('Component renders correctly and is responsive');
      criteria.push('All user interactions are functional');
      criteria.push('Code passes automated testing');
      criteria.push('Performance metrics meet requirements');
      break;
    case 'backend':
      criteria.push('API endpoints return correct responses');
      criteria.push('Data validation and error handling implemented');
      criteria.push('Integration and unit tests pass');
      criteria.push('Performance and security requirements met');
      break;
    case 'devops':
      criteria.push('Configuration is automated and repeatable');
      criteria.push('Deployment process is validated');
      criteria.push('Monitoring and logging are functional');
      break;
    case 'testing':
      criteria.push('Test coverage meets defined thresholds');
      criteria.push('All test scenarios are automated');
      criteria.push('Tests run successfully in CI/CD pipeline');
      break;
    case 'documentation':
      criteria.push('Documentation is complete and accurate');
      criteria.push('Code examples are functional and tested');
      criteria.push('API documentation is auto-generated');
      break;
    case 'integration':
      criteria.push('Data synchronization is working correctly');
      criteria.push('Error handling and retry logic implemented');
      criteria.push('Integration tests validate end-to-end flow');
      break;
    default:
      criteria.push('Implementation is complete and functional');
      criteria.push('Code follows established patterns and standards');
  }
  
  return criteria;
}

function generateTechnicalSpecs(title: string, description: string, technologyStack: string[]): string {
  const specs = [];
  
  if (technologyStack.includes('React')) {
    specs.push('Use React hooks and functional components with TypeScript');
  }
  if (technologyStack.includes('Node.js')) {
    specs.push('Implement using Node.js with proper error handling');
  }
  if (technologyStack.includes('PostgreSQL')) {
    specs.push('Use PostgreSQL with proper indexing and queries');
  }
  if (technologyStack.includes('Docker')) {
    specs.push('Containerize using Docker with multi-stage builds');
  }
  
  return specs.join('. ') || 'Follow established technical patterns and standards';
}

function generateValidationMethod(title: string, description: string, category: string): string {
  const validationMap = {
    design: 'Automated design token validation and component library checks',
    frontend: 'Unit tests, integration tests, and visual regression testing',
    backend: 'Unit tests, integration tests, API contract testing',
    devops: 'Infrastructure validation, deployment testing, monitoring checks',
    testing: 'Test execution, coverage reports, performance benchmarks',
    documentation: 'Documentation linting, link validation, example execution',
    integration: 'End-to-end testing, data validation, error scenario testing'
  };
  
  return validationMap[category as keyof typeof validationMap] || 'Automated testing and validation';
}

function generateAIRecommendations(tasks: any[], projectType: string, technologyStack: string[], executionMode: string): string[] {
  const recommendations = [];
  
  recommendations.push(`Total tasks identified: ${tasks.length} for ${executionMode} execution`);
  
  const criticalTasks = tasks.filter(task => task.priority === 'critical');
  if (criticalTasks.length > 0) {
    recommendations.push(`Execute ${criticalTasks.length} critical tasks first to unblock dependencies`);
  }
  
  const parallelizableTasks = tasks.filter(task => task.parallelizable);
  if (parallelizableTasks.length > 1) {
    recommendations.push(`${parallelizableTasks.length} tasks can be executed in parallel for faster completion`);
  }
  
  const complexTasks = tasks.filter(task => task.complexity === 'complex');
  if (complexTasks.length > 0) {
    recommendations.push(`${complexTasks.length} complex tasks may require additional validation and testing`);
  }
  
  const codeGenTasks = tasks.filter(task => task.aiCapability === 'code-generation');
  if (codeGenTasks.length > 0) {
    recommendations.push(`${codeGenTasks.length} tasks require code generation capabilities`);
  }
  
  const integrationTasks = tasks.filter(task => task.category === 'integration');
  if (integrationTasks.length > 0) {
    recommendations.push('Integration tasks should be executed after core functionality is complete');
  }
  
  return recommendations;
}