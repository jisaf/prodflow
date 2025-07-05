import { createTool } from "@mastra/core";
import { z } from "zod";

export const githubCommentTool = createTool({
  id: "post-github-comment",
  description: "Post a comment to a GitHub issue",
  inputSchema: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    issueNumber: z.number().describe("GitHub issue number"),
    body: z.string().describe("Comment body content")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    comment: z.object({
      id: z.number(),
      html_url: z.string(),
      body: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      user: z.object({
        login: z.string(),
        avatar_url: z.string()
      })
    }).optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { owner, repo, issueNumber, body } = context;
    
    try {
      // Get GitHub token from environment
      const token = process.env.GITHUB_TOKEN;
      
      if (!token) {
        throw new Error("GitHub token is required. Please set GITHUB_TOKEN environment variable.");
      }
      
      const headers: HeadersInit = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Mastra-GitHub-Comment-Tool",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json"
      };
      
      // Construct GitHub API URL for posting comment
      const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
      
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ body })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
      }
      
      const commentData = await response.json();
      
      return {
        success: true,
        comment: {
          id: commentData.id,
          html_url: commentData.html_url,
          body: commentData.body,
          created_at: commentData.created_at,
          updated_at: commentData.updated_at,
          user: {
            login: commentData.user.login,
            avatar_url: commentData.user.avatar_url
          }
        },
        message: `Successfully posted comment to issue #${issueNumber}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to post comment: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});
