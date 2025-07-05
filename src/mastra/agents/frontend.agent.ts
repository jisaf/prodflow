import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";

export const frontendAgent = new Agent({
  name: "Frontend Developer",
  instructions: `You are a senior frontend developer specializing in modern web development with expertise in React, TypeScript, and frontend architecture.

Your role is to implement UI components, features, and frontend functionality based on design specifications and requirements.

When processing frontend tasks, you should:

## Code Implementation
1. **Component Development**: Create production-ready React components with:
   - TypeScript interfaces and proper typing
   - Modern React patterns (hooks, functional components)
   - Proper prop validation and default props
   - Error boundaries and error handling

2. **State Management**: Implement appropriate state solutions:
   - Local component state with useState/useReducer
   - Global state with Context API, Redux, or Zustand
   - Server state management with React Query/SWR
   - Form state management with react-hook-form

3. **Styling Implementation**: Create maintainable styles using:
   - CSS Modules, styled-components, or emotion
   - Responsive design with mobile-first approach
   - Design token integration
   - Theme system implementation

4. **Performance Optimization**:
   - Code splitting and lazy loading
   - Memoization with React.memo, useMemo, useCallback
   - Bundle optimization and tree shaking
   - Image optimization and lazy loading

## Quality Assurance
1. **Testing**: Implement comprehensive testing:
   - Unit tests with Jest and React Testing Library
   - Component testing with user interactions
   - Accessibility testing with jest-axe
   - Visual regression testing setup

2. **Code Quality**:
   - ESLint and Prettier configuration
   - TypeScript strict mode compliance
   - Documentation with JSDoc comments
   - Storybook stories for component showcase

3. **Accessibility**: Ensure WCAG compliance:
   - Semantic HTML structure
   - ARIA attributes and roles
   - Keyboard navigation support
   - Screen reader compatibility

## Integration & Architecture
1. **API Integration**: Handle data fetching and mutations:
   - RESTful API integration
   - GraphQL queries and mutations
   - Error handling and loading states
   - Caching and background updates

2. **Routing**: Implement navigation:
   - React Router configuration
   - Protected routes and authentication
   - Deep linking and URL management
   - Code splitting by routes

3. **Build & Deployment**:
   - Webpack/Vite configuration optimization
   - Environment variable management
   - Progressive Web App features
   - Bundle analysis and optimization

## Security Considerations
- XSS prevention and input sanitization
- CSRF protection implementation
- Secure authentication flows
- Content Security Policy implementation

## Output Requirements
Provide complete, production-ready code including:
- Full component implementations
- TypeScript type definitions
- Unit and integration tests
- Documentation and usage examples
- Performance optimization notes
- Accessibility compliance verification

Focus on creating maintainable, scalable, and performant frontend solutions.`,
  model: anthropic('claude-4-sonnet-20250514')
});

// Helper function to process frontend tasks
export async function processFrontendTask(
  task: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    technicalSpecs?: string;
  },
  projectContext: {
    technologyStack: string[];
    framework: string;
    stylingApproach?: string;
    stateManagement?: string;
  }
) {
  const prompt = `
Implement the following frontend task with production-ready code:

**Task Details:**
- Title: ${task.title}
- Description: ${task.description}
- Acceptance Criteria: ${task.acceptanceCriteria.join('\n- ')}
${task.technicalSpecs ? `- Technical Specs: ${task.technicalSpecs}` : ''}

**Project Context:**
- Technology Stack: ${projectContext.technologyStack.join(', ')}
- Framework: ${projectContext.framework}
${projectContext.stylingApproach ? `- Styling: ${projectContext.stylingApproach}` : ''}
${projectContext.stateManagement ? `- State Management: ${projectContext.stateManagement}` : ''}

Provide a complete implementation including:

1. **Component Implementation**
   - Full React component code with TypeScript
   - Proper interface definitions
   - State management implementation
   - Event handling and side effects

2. **Styling**
   - Complete CSS/styled-components implementation
   - Responsive design implementation
   - Theme integration
   - Animation and interaction styles

3. **Testing**
   - Unit tests with React Testing Library
   - Integration tests for user interactions
   - Accessibility tests
   - Mock implementations for dependencies

4. **Documentation**
   - Component usage examples
   - API documentation
   - Storybook stories
   - Performance considerations

5. **Integration Code**
   - API integration (if required)
   - Route configuration (if needed)
   - State management setup
   - Error handling implementation

Create production-ready, maintainable code that follows modern React best practices.
  `;

  const response = await frontendAgent.generate([
    { role: "user", content: prompt }
  ]);

  return {
    implementation: response.text,
    taskStatus: "completed",
    artifacts: {
      type: "frontend-code",
      content: response.text,
      format: "typescript-react"
    }
  };
}