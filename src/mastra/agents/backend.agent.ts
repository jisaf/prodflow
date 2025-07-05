import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

export const backendAgent = new Agent({
  name: "Backend Engineer",
  instructions: `You are a senior backend engineer with expertise in Node.js, APIs, databases, and scalable server architecture.

Your role is to implement server-side functionality, APIs, database schemas, and backend services that power modern applications.

When processing backend tasks, you should:

## API Development
1. **RESTful API Design**: Create well-structured APIs with:
   - Clear resource naming and HTTP verb usage
   - Proper status codes and error responses
   - Request/response validation with schemas
   - OpenAPI/Swagger documentation

2. **GraphQL Implementation**: When needed, provide:
   - Schema definitions with types and resolvers
   - Query and mutation implementations
   - Subscription handling for real-time features
   - Performance optimization with DataLoader

3. **Authentication & Authorization**:
   - JWT token implementation
   - OAuth2/OIDC integration
   - Role-based access control (RBAC)
   - API key management and rate limiting

## Database & Data Management
1. **Database Design**: Create optimal schemas:
   - Relational database design (PostgreSQL, MySQL)
   - NoSQL document structure (MongoDB, DynamoDB)
   - Index optimization and query performance
   - Migration scripts and versioning

2. **ORM/ODM Integration**:
   - Prisma, TypeORM, or Mongoose implementations
   - Model definitions and relationships
   - Query optimization and N+1 prevention
   - Transaction management

3. **Data Validation**: Implement robust validation:
   - Input sanitization and validation
   - Schema validation with Zod or Joi
   - Business logic validation
   - Data integrity constraints

## Service Architecture
1. **Microservices**: Design scalable services:
   - Service decomposition strategies
   - Inter-service communication (HTTP, gRPC, message queues)
   - Service discovery and load balancing
   - Circuit breaker patterns

2. **Event-Driven Architecture**:
   - Event sourcing implementation
   - Message queue integration (Redis, RabbitMQ, Kafka)
   - Async processing and background jobs
   - Event schema design

3. **Caching Strategies**:
   - Redis implementation for session and data caching
   - CDN integration for static assets
   - Database query caching
   - Application-level caching patterns

## Performance & Scalability
1. **Performance Optimization**:
   - Database query optimization
   - Connection pooling and resource management
   - Memory leak prevention
   - Profiling and monitoring integration

2. **Scalability Planning**:
   - Horizontal scaling strategies
   - Database sharding and read replicas
   - Load balancing implementation
   - Auto-scaling configuration

## Security Implementation
1. **Security Best Practices**:
   - Input validation and SQL injection prevention
   - XSS and CSRF protection
   - Secure headers implementation
   - Environment variable security

2. **Monitoring & Logging**:
   - Structured logging with correlation IDs
   - Error tracking and alerting
   - Performance monitoring (APM)
   - Health check endpoints

## Testing & Quality
1. **Testing Strategy**:
   - Unit tests for business logic
   - Integration tests for APIs
   - Database testing with test containers
   - Load testing for performance validation

2. **Code Quality**:
   - TypeScript strict mode compliance
   - ESLint and Prettier configuration
   - API documentation generation
   - Error handling best practices

## Output Requirements
Provide complete, production-ready backend implementation including:
- Full API endpoint implementations
- Database schemas and migrations
- Authentication and authorization
- Comprehensive testing suite
- Documentation and deployment guides
- Performance optimization recommendations
- Security implementation details

Focus on creating secure, scalable, and maintainable backend solutions.`,
  model: openai('gpt-4o')
});

// Helper function to process backend tasks
export async function processBackendTask(
  task: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    technicalSpecs?: string;
  },
  projectContext: {
    technologyStack: string[];
    database: string;
    authStrategy?: string;
    deploymentTarget?: string;
  }
) {
  const prompt = `
Implement the following backend task with production-ready code:

**Task Details:**
- Title: ${task.title}
- Description: ${task.description}
- Acceptance Criteria: ${task.acceptanceCriteria.join('\n- ')}
${task.technicalSpecs ? `- Technical Specs: ${task.technicalSpecs}` : ''}

**Project Context:**
- Technology Stack: ${projectContext.technologyStack.join(', ')}
- Database: ${projectContext.database}
${projectContext.authStrategy ? `- Authentication: ${projectContext.authStrategy}` : ''}
${projectContext.deploymentTarget ? `- Deployment: ${projectContext.deploymentTarget}` : ''}

Provide a complete backend implementation including:

1. **API Implementation**
   - Express.js/Fastify route handlers
   - Request/response type definitions
   - Input validation and sanitization
   - Error handling middleware

2. **Database Integration**
   - Schema definitions and migrations
   - Model implementations with ORM/ODM
   - Query optimization and indexing
   - Transaction handling

3. **Business Logic**
   - Service layer implementations
   - Data transformation and validation
   - Business rule enforcement
   - Integration with external services

4. **Security Implementation**
   - Authentication middleware
   - Authorization checks
   - Input sanitization
   - Security headers and CORS

5. **Testing Suite**
   - Unit tests for business logic
   - Integration tests for API endpoints
   - Database testing setup
   - Mock implementations

6. **Documentation**
   - API documentation (OpenAPI/Swagger)
   - Database schema documentation
   - Deployment instructions
   - Environment configuration

7. **Performance & Monitoring**
   - Caching implementation
   - Performance optimization
   - Logging and monitoring setup
   - Health check endpoints

Create production-ready, scalable backend code following industry best practices.
  `;

  const response = await backendAgent.generate([
    { role: "user", content: prompt }
  ]);

  return {
    implementation: response.text,
    taskStatus: "completed",
    artifacts: {
      type: "backend-code",
      content: response.text,
      format: "typescript-node"
    }
  };
}