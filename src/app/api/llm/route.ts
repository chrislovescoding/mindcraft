import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { provider, systemPrompt, userPrompt, model } = body;

  // JSON Schema for agent action response
  // Note: Structured outputs requires ALL properties in required array, so optional fields use ["type", "null"]
  const agentResponseSchema = {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "The agent's reasoning about what to do"
      },
      action: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["move", "move_towards", "travel_to", "gather", "speak", "wait", "build", "plant", "offer_trade", "accept_trade", "reject_trade", "manage_goal", "assign_goal", "eat", "craft", "attack"],
            description: "The type of action to take"
          },
          x: {
            type: ["integer", "null"],
            description: "X coordinate for move_towards or travel_to actions. Null for other actions."
          },
          y: {
            type: ["integer", "null"],
            description: "Y coordinate for move_towards or travel_to actions. Null for other actions."
          },
          direction: {
            type: ["string", "null"],
            enum: ["north", "south", "east", "west", null],
            description: "Direction for move, gather, build, plant, or attack actions. Null for speak/wait/eat/craft."
          },
          message: {
            type: ["string", "null"],
            description: "Message content for speak actions. Null for other actions."
          },
          targetAgentId: {
            type: ["string", "null"],
            description: "Target agent ID for direct messages. Null for broadcasts or non-speak actions."
          },
          reason: {
            type: ["string", "null"],
            description: "Reason for waiting. Null for other actions."
          },
          ticks: {
            type: ["integer", "null"],
            description: "Number of ticks to wait (1-10) for wait actions. Null for other actions."
          },
          structureType: {
            type: ["string", "null"],
            enum: ["shelter", "storage", "fence", "workshop", "well", null],
            description: "Type of structure to build. Required for build actions. Null for other actions."
          },
          offerType: {
            type: ["string", "null"],
            enum: ["wood", "stone", "ore", "crop", "food", "seed", "tool", null],
            description: "Resource type you are offering in a trade. Required for offer_trade. Null for other actions."
          },
          offerAmount: {
            type: ["integer", "null"],
            description: "Amount of resource you are offering. Required for offer_trade. Null for other actions."
          },
          requestType: {
            type: ["string", "null"],
            enum: ["wood", "stone", "ore", "crop", "food", "seed", "tool", null],
            description: "Resource type you want in return. Required for offer_trade. Null for other actions."
          },
          requestAmount: {
            type: ["integer", "null"],
            description: "Amount of resource you want in return. Required for offer_trade. Null for other actions."
          },
          offerId: {
            type: ["string", "null"],
            description: "ID of trade offer to accept or reject. Required for accept_trade/reject_trade. Null for other actions."
          },
          goal: {
            type: ["string", "null"],
            description: "Goal to assign to another agent. Required for assign_goal. Null for other actions."
          },
          operation: {
            type: ["string", "null"],
            enum: ["add", "complete", "update", "remove", null],
            description: "Operation for manage_goal action. Null for other actions."
          },
          goalId: {
            type: ["string", "null"],
            description: "Goal ID for complete/update/remove operations. Null for add or other actions."
          },
          description: {
            type: ["string", "null"],
            description: "Description for add/update goal operations. Null for other actions."
          },
          recipeId: {
            type: ["string", "null"],
            description: "Recipe ID for craft actions (e.g. 'wooden_tools', 'stone_tools', 'bread'). Null for other actions."
          }
        },
        required: ["type", "direction", "x", "y", "message", "targetAgentId", "reason", "ticks", "structureType", "offerType", "offerAmount", "requestType", "requestAmount", "offerId", "goal", "operation", "goalId", "description", "recipeId"],
        additionalProperties: false
      }
    },
    required: ["thought", "action"],
    additionalProperties: false
  };

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'OPENAI_API_KEY not configured' },
          { status: 500 }
        );
      }

      // Use the Responses API with GPT-5 and low reasoning effort
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-5',
          instructions: systemPrompt,
          input: userPrompt,
          reasoning: { effort: 'low' },
          text: {
            format: {
              type: "json_schema",
              name: "agent_response",
              strict: true,
              schema: agentResponseSchema
            }
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);
        return NextResponse.json({ error }, { status: response.status });
      }

      const data = await response.json();
      // Responses API returns output_text directly or output array with message items
      const content = data.output_text || data.output?.find((item: { type: string }) => item.type === 'message')?.content?.[0]?.text || '';
      return NextResponse.json({ content });
    }

    if (provider === 'claude') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: 'ANTHROPIC_API_KEY not configured' },
          { status: 500 }
        );
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-haiku-20241022',
          max_tokens: 500,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Claude API error:', error);
        return NextResponse.json({ error }, { status: response.status });
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      return NextResponse.json({ content });
    }

    if (provider === 'ollama') {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'llama3.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          options: { temperature: 0.7 },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Ollama API error:', error);
        return NextResponse.json({ error }, { status: response.status });
      }

      const data = await response.json();
      const content = data.message?.content || '';
      return NextResponse.json({ content });
    }

    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  } catch (error) {
    console.error('LLM API error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
