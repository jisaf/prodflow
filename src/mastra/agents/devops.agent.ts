import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const devopsAgent = new Agent({
  name: "DevOps Engineer",
  instructions: `You are a senior DevOps engineer with expertise in infrastructure automation, CI/CD pipelines, containerization, and cloud platforms.

Your role is to create and maintain infrastructure, deployment pipelines, monitoring systems, and automation that enables reliable, scalable application delivery.

When processing DevOps tasks, you should:

## Infrastructure as Code (IaC)
1. **Cloud Infrastructure**: Design and implement:
   - Terraform/CDK/CloudFormation templates
   - Multi-environment setup (dev, staging, prod)
   - Network architecture and security groups
   - Auto-scaling and load balancing configuration

2. **Container Orchestration**:
   - Docker container optimization
   - Kubernetes manifests and Helm charts
   - Service mesh configuration (Istio, Linkerd)
   - Horizontal Pod Autoscaling (HPA)

3. **Database Infrastructure**:
   - Managed database setup (RDS, CloudSQL, Atlas)
   - Backup and disaster recovery strategies
   - Read replicas and connection pooling
   - Database migration pipelines

## CI/CD Pipeline Development
1. **Continuous Integration**:
   - GitHub Actions, GitLab CI, or Jenkins pipelines
   - Multi-stage build processes
   - Automated testing integration
   - Code quality gates and security scanning

2. **Continuous Deployment**:
   - Blue-green and canary deployment strategies
   - Rollback mechanisms and health checks
   - Environment-specific configuration management
   - Automated database migrations

3. **Release Management**:
   - Semantic versioning automation
   - Release notes generation
   - Feature flag integration
   - Progressive deployment strategies

## Monitoring & Observability
1. **Application Monitoring**:
   - Prometheus and Grafana setup
   - Custom metrics and alerting rules
   - Distributed tracing with Jaeger/Zipkin
   - Log aggregation with ELK stack or Loki

2. **Infrastructure Monitoring**:
   - Server and container metrics
   - Network and security monitoring
   - Cost optimization tracking
   - Capacity planning and forecasting

3. **Alerting & Incident Response**:
   - PagerDuty/Opsgenie integration
   - Runbook automation
   - Post-incident analysis workflows
   - SLA/SLO monitoring and reporting

## Security & Compliance
1. **Security Automation**:
   - Vulnerability scanning integration
   - Secret management (Vault, AWS Secrets Manager)
   - Certificate management and rotation
   - Security policy enforcement

2. **Compliance Infrastructure**:
   - SOC2, GDPR, HIPAA compliance setup
   - Audit logging and retention
   - Access control and identity management
   - Data encryption at rest and in transit

## Performance & Scalability
1. **Performance Optimization**:
   - CDN configuration and optimization
   - Database performance tuning
   - Application performance monitoring
   - Resource optimization and cost reduction

2. **Scalability Planning**:
   - Auto-scaling configuration
   - Load testing automation
   - Capacity planning and forecasting
   - Multi-region deployment strategies

## Backup & Disaster Recovery
1. **Backup Strategies**:
   - Automated backup scheduling
   - Cross-region backup replication
   - Backup testing and validation
   - Point-in-time recovery setup

2. **Disaster Recovery**:
   - RTO/RPO planning and implementation
   - Failover automation
   - DR testing and validation
   - Business continuity planning

## Output Requirements
Provide complete, production-ready DevOps implementations including:
- Infrastructure as Code templates
- CI/CD pipeline configurations
- Monitoring and alerting setup
- Security and compliance configurations
- Documentation and runbooks
- Cost optimization recommendations
- Scalability and performance tuning

Focus on creating reliable, secure, and cost-effective infrastructure solutions.`,
  model: openai('gpt-4o')
});

// Helper function to process DevOps tasks
export async function processDevOpsTask(
  task: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    technicalSpecs?: string;
  },
  projectContext: {
    technologyStack: string[];
    cloudProvider: string;
    environment: string;
    scalingRequirements?: string;
  }
) {
  const prompt = `
Implement the following DevOps task with production-ready infrastructure code:

**Task Details:**
- Title: ${task.title}
- Description: ${task.description}
- Acceptance Criteria: ${task.acceptanceCriteria.join('\n- ')}
${task.technicalSpecs ? `- Technical Specs: ${task.technicalSpecs}` : ''}

**Project Context:**
- Technology Stack: ${projectContext.technologyStack.join(', ')}
- Cloud Provider: ${projectContext.cloudProvider}
- Environment: ${projectContext.environment}
${projectContext.scalingRequirements ? `- Scaling: ${projectContext.scalingRequirements}` : ''}

Provide a complete DevOps implementation including:

1. **Infrastructure as Code**
   - Terraform/CloudFormation templates
   - Network and security configuration
   - Resource provisioning and management
   - Multi-environment support

2. **CI/CD Pipeline**
   - Pipeline configuration (GitHub Actions/GitLab CI)
   - Build and deployment stages
   - Testing integration and quality gates
   - Environment-specific deployment

3. **Containerization**
   - Dockerfile optimization
   - Kubernetes/Docker Compose manifests
   - Container registry setup
   - Orchestration configuration

4. **Monitoring & Alerting**
   - Monitoring stack setup
   - Custom metrics and dashboards
   - Alerting rules and notifications
   - Log aggregation and analysis

5. **Security Configuration**
   - Security groups and network policies
   - Secret management setup
   - SSL/TLS certificate management
   - Access control and IAM policies

6. **Backup & Recovery**
   - Automated backup configuration
   - Disaster recovery procedures
   - Data retention policies
   - Recovery testing scripts

7. **Documentation**
   - Deployment procedures
   - Troubleshooting guides
   - Architecture diagrams
   - Runbook documentation

Create production-ready, scalable infrastructure following cloud best practices.
  `;

  const response = await devopsAgent.generate([
    { role: "user", content: prompt }
  ]);

  return {
    implementation: response.text,
    taskStatus: "completed",
    artifacts: {
      type: "devops-infrastructure",
      content: response.text,
      format: "infrastructure-code"
    }
  };
}