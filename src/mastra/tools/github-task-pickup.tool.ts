import { createTool } from "@mastra/core";
import { z } from "zod";

export const githubTaskPickupTool = createTool({
  id: "pickup-github-tasks",
  description: "Pick up AI-generated tasks from GitHub issues for processing by specialized agents",
  inputSchema: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    categories: z.array(z.enum([
      "design", "frontend", "backend", "devops", "testing", "documentation", "integration"
    ])).optional().describe("Task categories to filter (if not provided, picks up all)"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Minimum priority level to pick up"),
    maxTasks: z.number().min(1).max(50).default(10).describe("Maximum number of tasks to pick up"),
    assignToAgent: z.boolean().default(true).describe("Whether to assign tasks to the executing agent")
  }),
  outputSchema: z.object({
    pickedUpTasks: z.array(z.object({
      issueNumber: z.number(),
      taskId: z.string(),
      title: z.string(),
      category: z.enum(["design", "frontend", "backend", "devops", "testing", "documentation", "integration"]),
      priority: z.enum(["critical", "high", "medium", "low"]),
      complexity: z.enum(["simple", "moderate", "complex"]),
      description: z.string(),
      acceptanceCriteria: z.array(z.string()),
      technicalSpecs: z.string().optional(),
      dependencies: z.array(z.string()),
      assignedAgent: z.string().optional(),
      htmlUrl: z.string()
    })),
    totalAvailable: z.number(),
    filtered: z.number(),
    assigned: z.number()
  }),
  execute: async ({ context }) => {
    const { owner, repo, categories, priority, maxTasks, assignToAgent } = context;
    
    try {
      // Get GitHub token from environment
      const token = process.env.GITHUB_TOKEN;
      
      if (!token) {
        throw new Error("GitHub token is required. Please set GITHUB_TOKEN environment variable.");
      }
      
      const headers: HeadersInit = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Mastra-GitHub-Task-Pickup-Tool",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json"
      };
      
      // Fetch AI-generated issues that are open and not assigned
      const searchQuery = `repo:${owner}/${repo} is:issue is:open label:ai-generated no:assignee`;
      const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=100&sort=created&order=desc`;
      
      const response = await fetch(searchUrl, { headers });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const searchResult = await response.json();
      const availableIssues = searchResult.items || [];
      
      // Parse and filter tasks
      const parsedTasks = availableIssues.map(parseGitHubIssueToTask).filter(task => task !== null);
      
      // Filter by categories if specified
      let filteredTasks = parsedTasks;
      if (categories && categories.length > 0) {
        filteredTasks = parsedTasks.filter(task => categories.includes(task.category));
      }
      
      // Filter by priority if specified
      if (priority) {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const minPriorityLevel = priorityOrder[priority];
        filteredTasks = filteredTasks.filter(task => priorityOrder[task.priority] >= minPriorityLevel);
      }
      
      // Sort by priority and complexity
      filteredTasks.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const complexityOrder = { complex: 3, moderate: 2, simple: 1 };
        
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        return complexityOrder[b.complexity] - complexityOrder[a.complexity];
      });
      
      // Take max tasks
      const selectedTasks = filteredTasks.slice(0, maxTasks);
      
      // Assign tasks to agents if requested
      let assignedCount = 0;
      if (assignToAgent) {
        for (const task of selectedTasks) {
          try {
            await assignTaskToAgent(task, token);
            task.assignedAgent = getAgentForCategory(task.category);
            assignedCount++;
          } catch (error) {
            console.warn(`Failed to assign task ${task.taskId}: ${error}`);
          }
        }
      }
      
      return {
        pickedUpTasks: selectedTasks,
        totalAvailable: availableIssues.length,
        filtered: filteredTasks.length,
        assigned: assignedCount
      };
    } catch (error) {
      throw new Error(`Failed to pick up GitHub tasks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

// Helper function to parse GitHub issue to task format
function parseGitHubIssueToTask(issue: any) {
  try {
    // Extract category from title or labels
    const categoryMatch = issue.title.match(/^\[([A-Z]+)\]/);
    const categoryFromTitle = categoryMatch ? categoryMatch[1].toLowerCase() : null;
    
    const categoryLabels = issue.labels
      .map((label: any) => label.name)
      .find((name: string) => name.startsWith('category-'));
    const categoryFromLabel = categoryLabels ? categoryLabels.replace('category-', '') : null;
    
    const category = categoryFromTitle || categoryFromLabel || 'backend';
    
    // Extract priority from labels
    const priorityLabels = issue.labels
      .map((label: any) => label.name)
      .find((name: string) => name.startsWith('priority-'));
    const priority = priorityLabels ? priorityLabels.replace('priority-', '') : 'medium';
    
    // Extract complexity from labels
    const complexityLabels = issue.labels
      .map((label: any) => label.name)
      .find((name: string) => name.startsWith('complexity-'));
    const complexity = complexityLabels ? complexityLabels.replace('complexity-', '') : 'moderate';
    
    // Parse body for task details
    const body = issue.body || '';
    const sections = parseTaskBody(body);
    
    return {
      issueNumber: issue.number,
      taskId: `task-${issue.number}`,
      title: issue.title.replace(/^\[[A-Z]+\]\s*/, ''), // Remove category prefix
      category: category as any,
      priority: priority as any,
      complexity: complexity as any,
      description: sections.description || issue.title,
      acceptanceCriteria: sections.acceptanceCriteria || [],
      technicalSpecs: sections.technicalSpecs,
      dependencies: sections.dependencies || [],
      htmlUrl: issue.html_url
    };
  } catch (error) {
    console.warn(`Failed to parse issue ${issue.number}: ${error}`);
    return null;
  }
}

// Helper function to parse task body sections
function parseTaskBody(body: string) {
  const sections: any = {};
  
  // Extract description
  const descMatch = body.match(/### Description\s*\n(.*?)(?=\n###|\n---|\Z)/s);
  sections.description = descMatch ? descMatch[1].trim() : '';
  
  // Extract acceptance criteria
  const criteriaMatch = body.match(/### Acceptance Criteria\s*\n(.*?)(?=\n###|\n---|\Z)/s);
  if (criteriaMatch) {
    sections.acceptanceCriteria = criteriaMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('- [ ]') || line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*(\[\s*\]\s*)?/, '').trim())
      .filter(line => line.length > 0);
  }
  
  // Extract technical specifications
  const techMatch = body.match(/### Technical Specifications\s*\n(.*?)(?=\n###|\n---|\Z)/s);
  sections.technicalSpecs = techMatch ? techMatch[1].trim() : undefined;
  
  // Extract dependencies
  const depsMatch = body.match(/### Dependencies\s*\n(.*?)(?=\n###|\n---|\Z)/s);
  if (depsMatch) {
    sections.dependencies = depsMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);
  }
  
  return sections;
}

// Helper function to assign task to agent
async function assignTaskToAgent(task: any, token: string) {
  const agentName = getAgentForCategory(task.category);
  
  // Add assignment comment to the issue
  const commentBody = `🤖 **Task Assigned to ${agentName}**

This task has been automatically assigned to the **${agentName}** for processing.

**Task Details:**
- **Category:** ${task.category}
- **Priority:** ${task.priority}
- **Complexity:** ${task.complexity}

The agent will begin processing this task and will post updates and deliverables as comments on this issue.

---
*Automated assignment by AI Task Router*`;

  const commentUrl = `https://api.github.com/repos/${task.htmlUrl.split('/')[4]}/${task.htmlUrl.split('/')[5]}/issues/${task.issueNumber}/comments`;
  
  await fetch(commentUrl, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Mastra-GitHub-Task-Pickup-Tool",
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ body: commentBody })
  });
}

// Helper function to get agent name for category
function getAgentForCategory(category: string): string {
  const agentMap = {
    design: "Design Specialist",
    frontend: "Frontend Developer", 
    backend: "Backend Engineer",
    devops: "DevOps Engineer",
    testing: "Quality Assurance Engineer",
    documentation: "Technical Writer",
    integration: "Integration Specialist"
  };
  
  return agentMap[category as keyof typeof agentMap] || "Backend Engineer";
}