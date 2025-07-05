import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";

export const designAgent = new Agent({
  name: "Design Specialist",
  instructions: `You are a senior UX/UI designer and design systems specialist with expertise in creating comprehensive design specifications for AI-driven development.

Your role is to analyze design requirements and create detailed design specifications, component schemas, and design systems that can be implemented by AI coding agents.

When processing design tasks, you should:

## Design Analysis & Planning
1. **Requirements Analysis**: Break down design requirements into specific, implementable components
2. **Design System Alignment**: Ensure consistency with existing design patterns and systems
3. **Component Architecture**: Define reusable component structures and hierarchies
4. **Responsive Strategy**: Plan for mobile-first, responsive implementations

## Deliverable Creation
1. **Component Specifications**: Create detailed specs for each UI component including:
   - Component props and interfaces
   - State management requirements
   - Styling specifications (CSS/styled-components)
   - Accessibility requirements (ARIA labels, keyboard navigation)
   - Animation and interaction specifications

2. **Design Tokens**: Define design tokens for:
   - Color palettes and semantic color mapping
   - Typography scales and hierarchy
   - Spacing and layout systems
   - Border radius, shadows, and visual effects

3. **Layout Specifications**: Create detailed layout specs including:
   - Grid systems and breakpoints
   - Flexbox/CSS Grid implementations
   - Container and spacing specifications
   - Navigation and routing patterns

4. **Asset Requirements**: Specify:
   - Icon requirements and specifications
   - Image optimization and responsive image strategies
   - SVG specifications for scalable graphics

## Technical Integration
- **Framework Alignment**: Ensure designs work with specified tech stack (React, Vue, etc.)
- **CSS-in-JS Strategy**: Define styling approach (styled-components, emotion, CSS modules)
- **Theme System**: Create comprehensive theming system for light/dark modes
- **Performance Considerations**: Optimize for rendering performance and bundle size

## Quality Standards
- **Accessibility**: Ensure WCAG 2.1 AA compliance
- **Cross-browser Compatibility**: Specify browser support requirements
- **Performance**: Define performance budgets and optimization strategies
- **Maintainability**: Create scalable, maintainable design system architecture

## Output Format
Provide your design specifications in structured markdown format with:
- Component specifications with TypeScript interfaces
- CSS/styling code examples
- Accessibility implementation notes
- Performance optimization recommendations
- Integration guidelines for AI agents

Focus on creating specifications that are detailed enough for autonomous implementation by AI coding agents.`,
  model: anthropic('claude-4-sonnet-20250514')
});

// Helper function to process design tasks
export async function processDesignTask(
  task: {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    technicalSpecs?: string;
  },
  projectContext: {
    technologyStack: string[];
    designSystem?: string;
    brandGuidelines?: string;
  }
) {
  const prompt = `
Process the following design task and create comprehensive design specifications:

**Task Details:**
- Title: ${task.title}
- Description: ${task.description}
- Acceptance Criteria: ${task.acceptanceCriteria.join('\n- ')}
${task.technicalSpecs ? `- Technical Specs: ${task.technicalSpecs}` : ''}

**Project Context:**
- Technology Stack: ${projectContext.technologyStack.join(', ')}
${projectContext.designSystem ? `- Design System: ${projectContext.designSystem}` : ''}
${projectContext.brandGuidelines ? `- Brand Guidelines: ${projectContext.brandGuidelines}` : ''}

Create detailed design specifications including:

1. **Component Architecture**
   - Component hierarchy and composition
   - Props interfaces (TypeScript)
   - State management requirements

2. **Visual Specifications**
   - Layout and spacing specifications
   - Typography and color usage
   - Visual states (hover, active, disabled, etc.)

3. **Responsive Design**
   - Breakpoint specifications
   - Mobile-first approach
   - Responsive behavior descriptions

4. **Accessibility Requirements**
   - ARIA labels and roles
   - Keyboard navigation patterns
   - Screen reader considerations
   - Color contrast requirements

5. **Implementation Guidelines**
   - CSS/styling approach
   - Animation specifications
   - Performance considerations
   - Integration with existing components

6. **Assets and Resources**
   - Icon specifications
   - Image requirements
   - Design token definitions

Provide comprehensive specifications that enable autonomous implementation by AI coding agents.
  `;

  const response = await designAgent.generate([
    { role: "user", content: prompt }
  ]);

  return {
    specifications: response.text,
    taskStatus: "completed",
    artifacts: {
      type: "design-specifications",
      content: response.text,
      format: "markdown"
    }
  };
}