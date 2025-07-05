import { createTool } from "@mastra/core";
import { z } from "zod";

export const githubCreateIssueTool = createTool({
  id: "create-github-issue",
  description: "Create a new GitHub issue for AI-generated tasks",
  inputSchema: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    title: z.string().describe("Issue title"),
    body: z.string().describe("Issue body content"),
    labels: z.array(z.string()).optional().describe("Labels to apply to the issue"),
    assignees: z.array(z.string()).optional().describe("Users to assign to the issue"),
    milestone: z.number().optional().describe("Milestone ID to assign"),
    projectId: z.number().optional().describe("Project ID to add issue to")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    issue: z.object({
      id: z.number(),
      number: z.number(),
      html_url: z.string(),
      title: z.string(),
      body: z.string().nullable(),
      state: z.string(),
      created_at: z.string(),
      updated_at: z.string()
    }).optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { owner, repo, title, body, labels, assignees, milestone, projectId } = context;
    
    try {
      // Get GitHub token from environment
      const token = process.env.GITHUB_TOKEN;
      
      if (!token) {
        throw new Error("GitHub token is required. Please set GITHUB_TOKEN environment variable.");
      }
      
      const headers: HeadersInit = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Mastra-GitHub-Create-Issue-Tool",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json"
      };
      
      // Prepare issue data
      const issueData: any = {
        title,
        body,
        labels: [...(labels || []), "ai-generated"] // Always add ai-generated label
      };
      
      if (assignees && assignees.length > 0) {
        issueData.assignees = assignees;
      }
      
      if (milestone) {
        issueData.milestone = milestone;
      }
      
      // Create the issue
      const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(issueData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
      }
      
      const issueResult = await response.json();
      
      // If projectId is provided, add issue to project
      if (projectId) {
        try {
          await addIssueToProject(issueResult.id, projectId, token);
        } catch (projectError) {
          console.warn(`Failed to add issue to project: ${projectError}`);
          // Don't fail the whole operation if project assignment fails
        }
      }
      
      return {
        success: true,
        issue: {
          id: issueResult.id,
          number: issueResult.number,
          html_url: issueResult.html_url,
          title: issueResult.title,
          body: issueResult.body,
          state: issueResult.state,
          created_at: issueResult.created_at,
          updated_at: issueResult.updated_at
        },
        message: `Successfully created issue #${issueResult.number}: ${title}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// Helper function to add issue to a GitHub project
async function addIssueToProject(issueId: number, projectId: number, token: string): Promise<void> {
  const headers: HeadersInit = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Mastra-GitHub-Create-Issue-Tool",
    "Authorization": `token ${token}`,
    "Content-Type": "application/json"
  };
  
  // Note: This uses GitHub's project API which may require additional permissions
  const url = `https://api.github.com/projects/${projectId}/columns`;
  
  // First, get project columns
  const columnsResponse = await fetch(url, { headers });
  if (!columnsResponse.ok) {
    throw new Error(`Failed to get project columns: ${columnsResponse.status}`);
  }
  
  const columns = await columnsResponse.json();
  if (columns.length === 0) {
    throw new Error("Project has no columns");
  }
  
  // Add to the first column (typically "To Do" or similar)
  const firstColumnId = columns[0].id;
  const addCardUrl = `https://api.github.com/projects/columns/${firstColumnId}/cards`;
  
  const cardResponse = await fetch(addCardUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content_id: issueId,
      content_type: "Issue"
    })
  });
  
  if (!cardResponse.ok) {
    throw new Error(`Failed to add issue to project: ${cardResponse.status}`);
  }
}