// ============================================
// LLM Provider - Abstract Interface
// ============================================

import { Agent, AgentContext, LLMResponse, Action } from '@/types';

/**
 * Abstract LLM Provider interface
 */
export interface ILLMProvider {
  name: string;
  generateDecision(agent: Agent, context: AgentContext): Promise<LLMResponse>;
}

/**
 * LLM Provider configuration
 */
export interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Create LLM provider based on config
 */
export async function createLLMProvider(config: LLMConfig): Promise<ILLMProvider> {
  switch (config.provider) {
    case 'claude':
      const { ClaudeProvider } = await import('./claude');
      return new ClaudeProvider(config.apiKey, config.model);

    case 'openai':
      const { OpenAIProvider } = await import('./openai');
      return new OpenAIProvider(config.apiKey, config.model);

    case 'ollama':
      const { OllamaProvider } = await import('./ollama');
      return new OllamaProvider(config.baseUrl, config.model);

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Mock provider for testing without API calls
 */
export class MockLLMProvider implements ILLMProvider {
  name = 'mock';

  async generateDecision(agent: Agent, context: AgentContext): Promise<LLMResponse> {
    // Simple mock logic: random movement or wait
    const directions = ['north', 'south', 'east', 'west'] as const;
    const randomDir = directions[Math.floor(Math.random() * directions.length)];

    return {
      thought: `I am ${agent.name}. I think I should explore ${randomDir}.`,
      actions: [{
        type: 'move' as any,
        direction: randomDir,
      }],
    };
  }
}
