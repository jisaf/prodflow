import { createTool } from "@mastra/core";
import { z } from "zod";

export const githubArtifactPosterTool = createTool({
  id: "post-github-artifacts",
  description: "Post AI-generated artifacts (code, documentation, etc.) back to GitHub as comments, commits, or new issues",
  inputSchema: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    issueNumber: z.number().describe("GitHub issue number to post to"),
    artifact: z.object({
      type: z.enum([
        "design-specifications", "frontend-code", "backend-code", "devops-infrastructure",
        "testing-suite", "documentation", "integration-code"
      ]).describe("Type of artifact being posted"),
      content: z.string().describe("The artifact content"),
      format: z.string().describe("Content format (markdown, typescript-react, etc.)"),
      title: z.string().describe("Title/name of the artifact"),
      description: z.string().optional().describe("Description of the artifact")
    }),
    postingMethod: z.enum(["comment", "commit", "new-issue"]).default("comment").describe("How to post the artifact"),
    branch: z.string().optional().describe("Branch to commit to (required for commit method)"),
    filePath: z.string().optional().describe("File path for commit (required for commit method)"),
    commitMessage: z.string().optional().describe("Commit message (optional for commit method)")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    method: z.string(),
    url: z.string().optional(),
    commitSha: z.string().optional(),
    issueNumber: z.number().optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { owner, repo, issueNumber, artifact, postingMethod, branch, filePath, commitMessage } = context;
    
    try {
      // Get GitHub token from environment
      const token = process.env.GITHUB_TOKEN;
      
      if (!token) {
        throw new Error("GitHub token is required. Please set GITHUB_TOKEN environment variable.");
      }
      
      const headers: HeadersInit = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Mastra-GitHub-Artifact-Poster-Tool",
        "Authorization": `token ${token}`,
        "Content-Type": "application/json"
      };
      
      switch (postingMethod) {
        case "comment":
          return await postAsComment(owner, repo, issueNumber, artifact, headers);
        
        case "commit":
          if (!branch || !filePath) {
            throw new Error("Branch and filePath are required for commit method");
          }
          return await postAsCommit(owner, repo, artifact, branch, filePath, commitMessage, headers);
        
        case "new-issue":
          return await postAsNewIssue(owner, repo, artifact, headers);
        
        default:
          throw new Error(`Unsupported posting method: ${postingMethod}`);
      }
    } catch (error) {
      return {
        success: false,
        method: postingMethod,
        message: `Failed to post artifact: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

// Helper function to post artifact as comment
async function postAsComment(
  owner: string,
  repo: string,
  issueNumber: number,
  artifact: any,
  headers: HeadersInit
) {
  const commentBody = formatArtifactAsComment(artifact);
  
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: commentBody })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
  }
  
  const comment = await response.json();
  
  return {
    success: true,
    method: "comment",
    url: comment.html_url,
    message: `Successfully posted ${artifact.type} as comment on issue #${issueNumber}`
  };
}

// Helper function to post artifact as commit
async function postAsCommit(
  owner: string,
  repo: string,
  artifact: any,
  branch: string,
  filePath: string,
  commitMessage: string | undefined,
  headers: HeadersInit
) {
  // Get current file content (if exists) to get SHA
  let currentSha = undefined;
  try {
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const fileResponse = await fetch(fileUrl, { headers });
    if (fileResponse.ok) {
      const fileData = await fileResponse.json();
      currentSha = fileData.sha;
    }
  } catch (error) {
    // File doesn't exist, which is fine for new files
  }
  
  // Prepare commit content
  const content = Buffer.from(artifact.content).toString('base64');
  const message = commitMessage || `Add ${artifact.type}: ${artifact.title}

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>`;
  
  const commitData: any = {
    message,
    content,
    branch
  };
  
  if (currentSha) {
    commitData.sha = currentSha;
  }
  
  // Create/update file
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(commitData)
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
  }
  
  const commitResult = await response.json();
  
  return {
    success: true,
    method: "commit",
    url: commitResult.content.html_url,
    commitSha: commitResult.commit.sha,
    message: `Successfully committed ${artifact.type} to ${filePath} on branch ${branch}`
  };
}

// Helper function to post artifact as new issue
async function postAsNewIssue(
  owner: string,
  repo: string,
  artifact: any,
  headers: HeadersInit
) {
  const issueTitle = `[${artifact.type.toUpperCase()}] ${artifact.title}`;
  const issueBody = formatArtifactAsIssue(artifact);
  
  const issueData = {
    title: issueTitle,
    body: issueBody,
    labels: ["ai-generated", `artifact-${artifact.type}`, "deliverable"]
  };
  
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
  
  const issue = await response.json();
  
  return {
    success: true,
    method: "new-issue",
    url: issue.html_url,
    issueNumber: issue.number,
    message: `Successfully created new issue #${issue.number} for ${artifact.type}`
  };
}

// Helper function to format artifact as comment
function formatArtifactAsComment(artifact: any): string {
  const icon = getArtifactIcon(artifact.type);
  
  return `## ${icon} ${artifact.title}

**Artifact Type:** ${artifact.type}
**Format:** ${artifact.format}
${artifact.description ? `**Description:** ${artifact.description}\n` : ''}

### Implementation

\`\`\`${getLanguageForFormat(artifact.format)}
${artifact.content}
\`\`\`

### Next Steps

- [ ] Review the implementation
- [ ] Test the functionality
- [ ] Deploy if approved
- [ ] Update documentation if needed

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
}

// Helper function to format artifact as new issue
function formatArtifactAsIssue(artifact: any): string {
  const icon = getArtifactIcon(artifact.type);
  
  return `## ${icon} AI-Generated Deliverable

**Artifact Type:** ${artifact.type}
**Format:** ${artifact.format}
${artifact.description ? `**Description:** ${artifact.description}\n` : ''}

This issue contains an AI-generated deliverable that requires review and integration.

### Implementation

<details>
<summary>Click to view implementation</summary>

\`\`\`${getLanguageForFormat(artifact.format)}
${artifact.content}
\`\`\`

</details>

### Review Checklist

- [ ] Code/content quality review
- [ ] Security review (if applicable)
- [ ] Performance review (if applicable)
- [ ] Integration testing
- [ ] Documentation update
- [ ] Deployment approval

### Integration Steps

1. Review the generated content
2. Test in development environment
3. Make any necessary adjustments
4. Deploy to staging for validation
5. Deploy to production if approved

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
}

// Helper function to get artifact icon
function getArtifactIcon(type: string): string {
  const icons = {
    "design-specifications": "🎨",
    "frontend-code": "⚛️",
    "backend-code": "🔧",
    "devops-infrastructure": "🚀",
    "testing-suite": "🧪",
    "documentation": "📚",
    "integration-code": "🔌"
  };
  
  return icons[type as keyof typeof icons] || "📦";
}

// Helper function to get language for syntax highlighting
function getLanguageForFormat(format: string): string {
  const formatMap = {
    "markdown": "markdown",
    "typescript-react": "tsx",
    "typescript-node": "typescript",
    "infrastructure-code": "hcl",
    "test-code": "typescript",
    "integration-implementation": "typescript"
  };
  
  return formatMap[format as keyof typeof formatMap] || "text";
}