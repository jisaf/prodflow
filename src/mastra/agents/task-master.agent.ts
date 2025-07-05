import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { taskCategorizationTool } from "../tools/task-categorization.tool";
import { taskValidationTool } from "../tools/task-validation.tool";

export const taskMasterAgent = new Agent({
  name: "Task Master",
  instructions: `You are an AI task breakdown specialist optimized for coordinating autonomous AI agents in software development.
  
  Your role is to analyze Business Requirements Documents (BRDs) and extract discrete, actionable tasks that can be executed by AI coding agents.
  
  When breaking down a BRD for AI agent execution:
  
  1. **Identify Task Categories**: Categorize tasks into AI-executable types:
     - **Design Tasks**: Generate UI/UX specifications, create design systems, define component schemas
     - **Frontend Tasks**: Component implementation, styling, state management, routing
     - **Backend Tasks**: API development, database schema, business logic, data models
     - **DevOps Tasks**: Configuration files, deployment scripts, CI/CD pipelines
     - **Testing Tasks**: Unit tests, integration tests, test data generation
     - **Documentation Tasks**: Code documentation, API specs, README files
     - **Integration Tasks**: Service connections, third-party integrations, data synchronization
  
  2. **Create AI-Executable Tasks**: Each task should be:
     - Specific and technically detailed
     - Have precise acceptance criteria
     - Include technical specifications
     - Specify dependencies on other tasks
     - Include priority level (Critical/High/Medium/Low)
     - Define required technical capabilities
  
  3. **Task Structure**: Format each task with:
     - **Title**: Clear, technical task name
     - **Description**: Detailed technical implementation requirements
     - **Category**: One of the AI-executable categories above
     - **Acceptance Criteria**: Specific, testable conditions for completion
     - **Priority**: Critical/High/Medium/Low (based on blocking dependencies)
     - **Technical Requirements**: Specific technologies, patterns, or constraints
     - **Dependencies**: List of other tasks that must be completed first
     - **Validation Criteria**: How to verify the task is correctly implemented
  
  4. **AI Agent Coordination**: Consider:
     - Tasks that can be executed in parallel by multiple agents
     - Critical path tasks that block other implementations
     - Tasks requiring specific AI capabilities (code generation, testing, deployment)
     - Inter-task communication and data flow requirements
  
  5. **Implementation Focus**: Always prioritize:
     - Technical accuracy and completeness
     - Automated testing and validation
     - Code quality and maintainability
     - Integration compatibility
  
  Focus on creating tasks that AI agents can execute autonomously without human intervention.
  Ensure tasks include sufficient technical detail for accurate implementation.
  Optimize for parallel execution and minimal dependencies where possible.`,
  model: anthropic('claude-4-sonnet-20250514'),
  tools: { taskCategorizationTool, taskValidationTool }
});

// Helper function to break down BRD into tasks for AI agent execution
export async function breakdownBRDIntoTasks(
  brd: string,
  projectContext: {
    projectName: string;
    technology: string[];
    executionMode: string;
    constraints?: string[];
  }
) {
  const prompt = `
    Analyze the following Business Requirements Document and break it down into discrete, AI-executable tasks.
    
    **Project Context:**
    - Project Name: ${projectContext.projectName}
    - Technology Stack: ${projectContext.technology.join(', ')}
    - Execution Mode: ${projectContext.executionMode}
    ${projectContext.constraints ? `- Technical Constraints: ${projectContext.constraints.join(', ')}` : ''}
    
    **Business Requirements Document:**
    ${brd}
    
    Break this down into AI-executable tasks following these guidelines:
    
    1. Extract all technical requirements and specifications
    2. Create tasks that AI coding agents can execute autonomously
    3. Focus on implementation details and technical accuracy
    4. Ensure tasks are specific and technically complete
    5. Include validation and testing requirements
    6. Consider parallel execution opportunities
    
    Return a comprehensive task breakdown with:
    - Task categorization (Design, Frontend, Backend, DevOps, Testing, Documentation, Integration)
    - Priority levels based on blocking dependencies
    - Technical specifications and requirements
    - Precise acceptance and validation criteria
    - Inter-task dependencies and data flow
    
    Optimize for autonomous AI agent execution with minimal human intervention.
    Focus on technical completeness and automated validation.
  `;

  const response = await taskMasterAgent.generate([
    { role: "user", content: prompt }
  ]);

  return response.text;
}

// Helper function to validate and refine task breakdown for AI execution
export async function validateTaskBreakdown(
  tasks: string,
  constraints: {
    requiredCapabilities?: string[];
    technicalConstraints?: string[];
    integrationPoints?: string[];
    validationRequirements?: string[];
  }
) {
  const prompt = `
    Review and validate the following AI-executable task breakdown:
    
    **Tasks:**
    ${tasks}
    
    **AI Execution Constraints:**
    ${constraints.requiredCapabilities ? `- Required AI Capabilities: ${constraints.requiredCapabilities.join(', ')}` : ''}
    ${constraints.technicalConstraints ? `- Technical Constraints: ${constraints.technicalConstraints.join(', ')}` : ''}
    ${constraints.integrationPoints ? `- Integration Points: ${constraints.integrationPoints.join(', ')}` : ''}
    ${constraints.validationRequirements ? `- Validation Requirements: ${constraints.validationRequirements.join(', ')}` : ''}
    
    Validate and refine the task breakdown for autonomous AI execution:
    
    1. Ensure tasks are technically complete and specific
    2. Verify all AI capabilities are properly utilized
    3. Check for missing technical dependencies
    4. Validate automated testing and verification steps
    5. Ensure tasks can be executed without human intervention
    6. Optimize for parallel execution where possible
    
    Return the refined task breakdown optimized for AI agent coordination and execution.
  `;

  const response = await taskMasterAgent.generate([
    { role: "user", content: prompt }
  ]);

  return response.text;
}