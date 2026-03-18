// ============================================
// OpenAI LLM Provider Implementation
// ============================================

import { Agent, AgentContext, LLMResponse, ActionType, Action } from '@/types';
import { ILLMProvider } from './provider';
import { buildSystemPrompt, buildContextPrompt, parseLLMResponse } from './prompts';
import { parseAction } from '@/engine/actions';

export class OpenAIProvider implements ILLMProvider {
  name = 'openai';
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.model = model || 'gpt-5';
  }

  async generateDecision(agent: Agent, context: AgentContext): Promise<LLMResponse> {
    const systemPrompt = buildSystemPrompt(agent);
    const userPrompt = buildContextPrompt(agent, context);

    try {
      // Call our API route instead of OpenAI directly
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'openai',
          systemPrompt,
          userPrompt,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('OpenAI API error:', error);
        return this.getErrorResponse(`API returned error: ${error.error || 'Unknown API error'}`);
      }

      const data = await response.json();
      const content = data.content || '';

      console.log(`[OpenAI] ${agent.name} raw response:`, content);

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
        console.warn(`[OpenAI] ${agent.name} some actions failed to parse:`, parseErrors);
      }

      return {
        thought: parsed.thought,
        actions: parsedActions,
      };
    } catch (error) {
      console.error('OpenAI API call failed:', error);
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
