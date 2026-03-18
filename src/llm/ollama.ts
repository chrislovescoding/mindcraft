// ============================================
// Ollama (Local) LLM Provider Implementation
// ============================================

import { Agent, AgentContext, LLMResponse, ActionType, Action } from '@/types';
import { ILLMProvider } from './provider';
import { buildSystemPrompt, buildContextPrompt, parseLLMResponse } from './prompts';
import { parseAction } from '@/engine/actions';

export class OllamaProvider implements ILLMProvider {
  name = 'ollama';
  private model: string;

  constructor(baseUrl?: string, model?: string) {
    this.model = model || 'llama3.2';
  }

  async generateDecision(agent: Agent, context: AgentContext): Promise<LLMResponse> {
    const systemPrompt = buildSystemPrompt(agent);
    const userPrompt = buildContextPrompt(agent, context);

    try {
      // Call our API route instead of Ollama directly
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'ollama',
          systemPrompt,
          userPrompt,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Ollama API error:', error);
        return this.getErrorResponse(`API returned error: ${error.error || 'Unknown API error'}`);
      }

      const data = await response.json();
      const content = data.content || '';

      console.log(`[Ollama] ${agent.name} raw response:`, content);

      const parsed = parseLLMResponse(content);
      if (!parsed) {
        return this.getErrorResponse('Failed to parse LLM response as JSON. The response must contain a valid JSON object with "thought" and "actions" fields.');
      }

      // Parse all actions from the array
      const parsedActions: Action[] = [];
      const parseErrors: string[] = [];

      for (let i = 0; i < parsed.actions.length; i++) {
        const { action, error } = parseAction(parsed.actions[i]);
        if (action) {
          parsedActions.push(action);
        } else {
          parseErrors.push(`Action ${i + 1}: ${error}`);
        }
      }

      // If all actions failed to parse, return error
      if (parsedActions.length === 0) {
        return this.getErrorResponse(`All actions failed to parse: ${parseErrors.join('; ')}`);
      }

      // If some actions failed, log warnings but continue with valid ones
      if (parseErrors.length > 0) {
        console.warn(`[Ollama] ${agent.name} some actions failed to parse:`, parseErrors);
      }

      return {
        thought: parsed.thought,
        actions: parsedActions,
      };
    } catch (error) {
      console.error('Ollama API call failed:', error);
      return this.getErrorResponse(`API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getErrorResponse(errorMessage: string): LLMResponse {
    return {
      thought: `ERROR: ${errorMessage}`,
      actions: [{
        type: ActionType.WAIT,
        reason: errorMessage,
      }],
    };
  }
}
