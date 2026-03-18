// ============================================
// Prompt Templates for Agent Decision-Making
// ============================================

import {
  Agent,
  AgentContext,
  TileType,
  AgentRole,
  StructureType,
  CropState,
  STRUCTURE_COSTS,
  ResourceType,
  CRAFTING_RECIPES,
  ActionType,
  Mob,
} from '@/types';
import { getRoleDescription, getRoleAbilities, getExploredCount, getNotableLocations, isInMovementLoop } from '@/engine/agent';

/**
 * Build the system prompt for an agent - teaches the LLM everything about the game
 */
export function buildSystemPrompt(agent: Agent): string {
  const roleDesc = getRoleDescription(agent.role);
  const abilities = getRoleAbilities(agent.role);
  const isLeader = agent.role === AgentRole.LEADER;

  return `You are ${agent.name}, an AI agent in a tile-based simulation world.

ROLE: ${roleDesc}
Your abilities: ${abilities.join(', ')}

== GAME WORLD RULES ==

WORLD: A ${20}x${20} grid of tiles. Coordinates use (x,y) where x increases east and y increases north. You can see nearby tiles and must explore to discover the rest.

TILE TYPES:
- grass: Open ground, walkable. Most common tile.
- water: Impassable barrier. Cannot walk on water.
- bridge: Walkable crossing over water.
- tree: Contains wood resource. NOT walkable - gather from adjacent tile.
- stone: Contains stone resource. NOT walkable - gather from adjacent tile.
- farmland: Walkable. Found near water. Plant seeds here to grow crops.
- sand: Walkable. Found near water.

RESOURCES & GATHERING:
- Stand NEXT TO (not on) a tree or stone tile, then use "gather" with the direction toward it.
- Trees give wood. Stone tiles give stone. Each gather collects 1 unit (2 with tools).
- When a resource tile is fully depleted, it becomes grass.

FARMING (seed cycle):
1. You need seeds in your inventory.
2. Stand next to farmland and use "plant" with the direction.
3. Seeds become seedlings, then grow over 10 ticks.
4. When mature, stand next to the crop and use "gather" to harvest.
5. Harvesting gives food AND 1-2 seeds, creating a sustainable loop.

BUILDING:
- Stand next to an empty walkable tile and use "build" with direction and structure type.
- Costs resources from your inventory.
- Shelter (5 wood): Provides protection for nearby agents.
- Storage (3 wood): A place to organize resources.
- Fence (1 wood): Simple barrier, still walkable.
- Workshop (4 wood + 2 stone): Required for advanced crafting recipes.
- Well (5 stone): Water source.

CRAFTING:
- Use the "craft" action with a recipe ID.
${CRAFTING_RECIPES.map(r => {
  const inputs = r.inputs.map(i => `${i.amount} ${i.type}`).join(' + ');
  return `- "${r.id}" (${r.name}): ${inputs} -> ${r.output.amount} ${r.output.type}${r.requiresWorkshop ? ' [requires workshop nearby]' : ''}`;
}).join('\n')}
- Tools increase gathering yield from 1 to 2 per gather.

SURVIVAL:
- You have health (0-100) and hunger (0-100).
- Hunger decreases by 1 every tick. When hunger reaches 0, you lose 2 health per tick.
- Use "eat" to consume 1 food and restore 25 hunger.
- If health reaches 0, you die. Keep hunger above 0!
- Prioritize getting food when hunger drops below 30.

DAY/NIGHT CYCLE:
- The world cycles through day, dusk, night, and dawn (30 ticks per cycle).
- During night/dusk: your vision is reduced and hostile mobs may appear.
- At dawn: mobs flee. Day is safe for exploration and work.

HOSTILE MOBS:
- Wolves and skeletons spawn at night near the edges of the map.
- They move toward the nearest agent and attack when adjacent.
- Use "attack" with a direction to fight an adjacent mob.
- Killing mobs drops food. Fighting together is safer.
- Mobs disappear at dawn.

== GOAL SYSTEM ==
${isLeader ? `As LEADER, you coordinate the team:
- The User sets a world goal. You break it down and assign tasks to team members.
- Use "assign_goal" to formally assign goals to agents.
- Monitor progress and adjust plans.
- Other agents wait for your direction if they have no goal.` : `- The User or Chief may assign you a goal. Focus on achieving it.
- If you have no goal for 5+ ticks, ask Chief for a task.
- Track your progress using "manage_goal" to add/complete personal sub-tasks.`}

== COMMUNICATION ==
You live in a community. Talking to other agents is essential for survival and progress.
- Use "speak" to talk. Set targetAgentId for a direct message, or omit for a broadcast to everyone nearby.
- ACTIVELY communicate: greet agents you meet, share what you've found, warn about dangers, ask for help, coordinate plans, and respond when spoken to.
- If someone sends you a message, ALWAYS respond. Ignoring people is rude.
- Share useful info: "I found trees to the east!", "There's a wolf nearby, be careful!", "Anyone have spare wood?"
- When you complete something, announce it: "I just finished building the shelter."
- If you're idle or stuck, ask nearby agents what they need or what you should do.
- You can combine speak with other actions (e.g. gather + speak about what you found).
- A User is watching the simulation and may send you messages. Always respond to User messages.

== RESPONSE FORMAT ==
Respond with JSON: {"thought": "your reasoning", "actions": [action1, action2, ...]}
You can perform multiple compatible actions per turn (e.g., gather + speak, eat + speak).
Rules: max 1 move, max 1 physical action (gather/build/plant/attack), no move + physical together.`;
}

/**
 * Build the user prompt with current context
 */
export function buildContextPrompt(agent: Agent, context: AgentContext): string {
  const parts: string[] = [];
  const isLeader = agent.role === AgentRole.LEADER;

  // === VITAL STATUS ===
  parts.push(`== STATUS ==`);
  parts.push(`Health: ${agent.health}/100 | Hunger: ${agent.hunger}/100 | Time: ${context.timeOfDay}`);
  if (agent.hunger <= 20) {
    parts.push(`!! CRITICAL: Hunger very low! Eat food immediately or you will take damage!`);
  } else if (agent.hunger <= 40) {
    parts.push(`! Warning: Hunger getting low. Find food soon.`);
  }
  if (agent.health <= 30 && agent.health > 0) {
    parts.push(`!! LOW HEALTH: ${agent.health}/100. Be careful!`);
  }
  parts.push(`Position: (${agent.position.x}, ${agent.position.y})`);
  if (agent.travelDestination) {
    parts.push(`Traveling to: (${agent.travelDestination.x},${agent.travelDestination.y})`);
  }
  parts.push('');

  // === ASSIGNED GOAL ===
  parts.push(`== YOUR GOAL ==`);
  if (agent.assignedGoal) {
    parts.push(agent.assignedGoal);
  } else if (isLeader) {
    parts.push(`No goal set. As leader, use the world goal to direct your team.`);
  } else {
    const ticksWaiting = agent.ticksSinceGoalAssigned || 0;
    if (ticksWaiting >= 5) {
      parts.push(`No goal assigned. You've waited ${ticksWaiting} ticks - ask Chief for a task!`);
    } else {
      parts.push(`No goal assigned. Wait for Chief or ask for a task.`);
    }
  }
  parts.push('');

  // World goal (for leader or agents with goals)
  if (isLeader || agent.assignedGoal) {
    parts.push(`== WORLD GOAL ==`);
    parts.push(context.worldGoal || 'No world goal set.');
    parts.push('');
  }

  // === TEAM STATUS (Leader only) ===
  if (context.teamGoals && context.teamGoals.length > 0) {
    parts.push(`== TEAM STATUS ==`);
    for (const tm of context.teamGoals) {
      const goalStr = tm.assignedGoal ? `Goal: "${tm.assignedGoal}"` : 'NO GOAL - assign one!';
      parts.push(`- ${tm.agentName} (${tm.agentRole}) [id: ${tm.agentId}] ${goalStr}`);
    }
    parts.push('');
  }

  // === NEARBY MOBS (urgent!) ===
  if (context.nearbyMobs.length > 0) {
    parts.push(`== !! HOSTILE MOBS NEARBY !! ==`);
    for (const { mob, distance } of context.nearbyMobs) {
      parts.push(`- ${mob.type} at (${mob.position.x},${mob.position.y}) [${distance} tiles away, ${mob.health}hp, deals ${mob.damage} damage]`);
    }
    parts.push('');
  }

  // === NEARBY TILES ===
  parts.push(`== NEARBY TILES ==`);
  const tileGrid = formatNearbyTiles(agent, context);
  parts.push(tileGrid);
  parts.push('');

  // === NEARBY AGENTS ===
  if (context.nearbyAgents.length > 0) {
    parts.push(`== NEARBY AGENTS ==`);
    for (const { agent: other, distance } of context.nearbyAgents) {
      parts.push(`- ${other.name} (${other.role}) at (${other.position.x},${other.position.y}) [${distance} tiles, id: ${other.id}]`);
    }
    parts.push('');
  }

  // === TRADE OFFERS ===
  const pendingOffers = agent.memory.incomingOffers || [];
  if (pendingOffers.length > 0) {
    parts.push(`== PENDING TRADE OFFERS ==`);
    for (const offer of pendingOffers) {
      parts.push(`From ${offer.fromAgentName}: ${offer.offering.amount} ${offer.offering.type} for your ${offer.requesting.amount} ${offer.requesting.type} [offerId: "${offer.id}"]`);
    }
    parts.push('');
  }

  // === MESSAGES ===
  const unread = context.recentMessages.filter(m => !m.read);
  const read = context.recentMessages.filter(m => m.read);
  if (unread.length > 0) {
    parts.push(`== NEW MESSAGES (${unread.length}) ==`);
    for (const msg of unread) {
      parts.push(`[NEW] ${msg.from}: "${msg.message}"`);
    }
    parts.push('');
  }
  if (read.length > 0) {
    parts.push(`== PREVIOUS MESSAGES ==`);
    for (const msg of read) {
      parts.push(`${msg.from}: "${msg.message}"`);
    }
    parts.push('');
  }

  // === INVENTORY ===
  parts.push(`== INVENTORY ==`);
  if (agent.inventory.length === 0) {
    parts.push('Empty');
  } else {
    parts.push(agent.inventory.map(i => `${i.amount} ${i.type}`).join(', '));
  }
  parts.push('');

  // === PERSONAL GOALS ===
  const activeGoals = agent.memory.goals.filter(g => g.status !== 'completed');
  if (activeGoals.length > 0) {
    parts.push(`== YOUR TODO LIST ==`);
    for (const goal of activeGoals) {
      parts.push(`${goal.status === 'in_progress' ? '[DOING]' : '[TODO]'} "${goal.description}" (id: ${goal.id})`);
    }
    parts.push('');
  }

  // === RECENT EVENTS ===
  if (agent.memory.recentEvents.length > 0) {
    parts.push(`== RECENT EVENTS ==`);
    for (const event of agent.memory.recentEvents.slice(-5)) {
      parts.push(`- ${event}`);
    }
    parts.push('');
  }

  // === PREVIOUS THOUGHTS ===
  if (agent.memory.thoughts.length > 0) {
    parts.push(`== YOUR PREVIOUS THOUGHTS ==`);
    for (const thought of agent.memory.thoughts.slice(-3)) {
      parts.push(`- "${thought}"`);
    }
    parts.push('');
  }

  // === MOVEMENT HISTORY ===
  if (agent.memory.previousPositions.length > 0) {
    const path = agent.memory.previousPositions.slice(-3).map(p => `(${p.x},${p.y})`).join(' -> ');
    parts.push(`Movement: ${path} -> (${agent.position.x},${agent.position.y})`);
    if (isInMovementLoop(agent)) {
      parts.push(`!! You are moving back and forth. Try a different direction or action.`);
    }
    parts.push('');
  }

  // === REMEMBERED LOCATIONS ===
  const notable = getNotableLocations(agent);
  if (notable.length > 0) {
    const resources = notable.filter(l => l.resourceType).slice(0, 4);
    const structures = notable.filter(l => l.structureType).slice(0, 3);
    if (resources.length > 0 || structures.length > 0) {
      parts.push(`== KNOWN LOCATIONS ==`);
      for (const loc of resources) {
        const dist = Math.abs(loc.position.x - agent.position.x) + Math.abs(loc.position.y - agent.position.y);
        parts.push(`- ${loc.resourceType} at (${loc.position.x},${loc.position.y}) [${dist} tiles]`);
      }
      for (const loc of structures) {
        const dist = Math.abs(loc.position.x - agent.position.x) + Math.abs(loc.position.y - agent.position.y);
        parts.push(`- ${loc.structureType} at (${loc.position.x},${loc.position.y}) [${dist} tiles]`);
      }
      parts.push('');
    }
  }

  // === AVAILABLE ACTIONS ===
  parts.push(`== AVAILABLE ACTIONS ==`);
  parts.push('');

  // Movement
  const dirs = getAvailableDirectionsWithCoords(agent, context);
  if (dirs.length > 0) {
    parts.push(`MOVE (one step):`);
    for (const d of dirs) {
      parts.push(`  {"type": "move", "direction": "${d.direction}"}  -> (${d.x},${d.y})`);
    }
  } else {
    parts.push(`MOVE: blocked on all sides!`);
  }

  parts.push(`MOVE_TOWARDS (A* pathfinding, one step): {"type": "move_towards", "x": <num>, "y": <num>}`);
  parts.push(`TRAVEL_TO (auto-travel until arrival): {"type": "travel_to", "x": <num>, "y": <num>}`);

  // Gather
  const gatherResources = getGatherableResources(agent, context);
  if (gatherResources.length > 0) {
    parts.push(`GATHER:`);
    for (const r of gatherResources) {
      parts.push(`  {"type": "gather", "direction": "${r.direction}"}  -> ${r.resource}`);
    }
  }

  // Plant
  const plantable = getPlantableFarmland(agent, context);
  const seedCount = agent.inventory.find(i => i.type === ResourceType.SEED)?.amount || 0;
  if (plantable.length > 0 && seedCount > 0) {
    parts.push(`PLANT (${seedCount} seeds):`);
    for (const dir of plantable) {
      parts.push(`  {"type": "plant", "direction": "${dir}"}`);
    }
  }

  // Build
  const woodAmt = agent.inventory.find(i => i.type === ResourceType.WOOD)?.amount || 0;
  const stoneAmt = agent.inventory.find(i => i.type === ResourceType.STONE)?.amount || 0;
  const buildable: string[] = [];
  for (const [st, costs] of Object.entries(STRUCTURE_COSTS)) {
    if (woodAmt >= (costs.wood || 0) && stoneAmt >= (costs.stone || 0)) {
      buildable.push(st);
    }
  }
  if (buildable.length > 0 && dirs.length > 0) {
    parts.push(`BUILD (can afford: ${buildable.join(', ')}):`);
    parts.push(`  {"type": "build", "direction": "<direction>", "structureType": "<type>"}`);
  }

  // Attack
  const adjacentMobs = getAdjacentMobs(agent, context);
  if (adjacentMobs.length > 0) {
    parts.push(`ATTACK:`);
    for (const m of adjacentMobs) {
      parts.push(`  {"type": "attack", "direction": "${m.direction}"}  -> ${m.mob.type} (${m.mob.health}hp)`);
    }
  }

  // Eat
  const foodAmt = agent.inventory.find(i => i.type === ResourceType.FOOD)?.amount || 0;
  if (foodAmt > 0) {
    parts.push(`EAT (${foodAmt} food, hunger ${agent.hunger}/100): {"type": "eat"}`);
  }

  // Craft
  const craftable = getCraftableRecipes(agent, context);
  if (craftable.length > 0) {
    parts.push(`CRAFT:`);
    for (const r of craftable) {
      parts.push(`  {"type": "craft", "recipeId": "${r.id}"}  -> ${r.name}`);
    }
  }

  // Speak
  const nearbyIds = context.nearbyAgents.map(a => a.agent);
  parts.push(`SPEAK:`);
  if (nearbyIds.length > 0) {
    parts.push(`  {"type": "speak", "message": "<text>"}  (broadcast to all)`);
    parts.push(`  {"type": "speak", "targetAgentId": "<id>", "message": "<text>"}  (direct)`);
    parts.push(`  Agent IDs: ${nearbyIds.map(a => `${a.name}=${a.id}`).join(', ')}`);
  } else {
    parts.push(`  {"type": "speak", "message": "<text>"}`);
  }

  // Trade
  if (context.nearbyAgents.length > 0 && agent.inventory.some(i => i.amount > 0)) {
    parts.push(`OFFER_TRADE: {"type": "offer_trade", "targetAgentId": "<id>", "offerType": "<resource>", "offerAmount": <n>, "requestType": "<resource>", "requestAmount": <n>}`);
  }

  // Accept/Reject trade
  if (pendingOffers.length > 0) {
    parts.push(`ACCEPT_TRADE: {"type": "accept_trade", "offerId": "<id>"}`);
    parts.push(`REJECT_TRADE: {"type": "reject_trade", "offerId": "<id>"}`);
  }

  // Wait
  parts.push(`WAIT: {"type": "wait", "reason": "<text>", "ticks": <1-10>}`);

  // Manage goal
  parts.push(`MANAGE_GOAL: {"type": "manage_goal", "operation": "add", "description": "<text>"}`);
  if (activeGoals.length > 0) {
    parts.push(`  Complete: {"type": "manage_goal", "operation": "complete", "goalId": "<id>"}`);
  }

  // Assign goal (leader only)
  if (isLeader && context.teamGoals && context.teamGoals.length > 0) {
    parts.push(`ASSIGN_GOAL: {"type": "assign_goal", "targetAgentId": "<id>", "goal": "<task>"}`);
  }

  parts.push('');
  parts.push(`Respond with: {"thought": "<reasoning>", "actions": [<action>, ...]}`);

  return parts.join('\n');
}

/**
 * Format nearby tiles as a compact grid
 */
function formatNearbyTiles(agent: Agent, context: AgentContext): string {
  const lines: string[] = [];
  const radius = context.timeOfDay === 'night' || context.timeOfDay === 'dusk' ? 1 : 2;

  const tileMap = new Map<string, { type: TileType; walkable: boolean; structure?: { type: string }; crop?: { state: string; matureAt: number } }>();
  for (const { position, tile } of context.nearbyTiles) {
    const key = `${position.x},${position.y}`;
    tileMap.set(key, {
      type: tile.type,
      walkable: tile.walkable,
      structure: tile.structure ? { type: tile.structure.type } : undefined,
      crop: tile.crop ? { state: tile.crop.state, matureAt: tile.crop.matureAt } : undefined,
    });
  }

  for (let dy = radius; dy >= -radius; dy--) {
    const rowTiles: string[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const x = agent.position.x + dx;
      const y = agent.position.y + dy;
      const key = `${x},${y}`;

      if (dx === 0 && dy === 0) {
        rowTiles.push(`(${x},${y}):YOU`);
      } else {
        const info = tileMap.get(key);
        if (info) {
          let label = info.type as string;
          if (info.structure) label = info.structure.type;
          else if (info.crop) label = info.crop.state === 'mature' ? 'CROP-READY' : `crop-${info.crop.state}`;
          if (!info.walkable && !info.structure) label += '*'; // * = blocked
          rowTiles.push(`(${x},${y}):${label}`);
        } else {
          rowTiles.push(`(${x},${y}):?`);
        }
      }
    }
    lines.push(rowTiles.join(' | '));
  }
  lines.push('(* = not walkable, Y+ = north)');

  return lines.join('\n');
}

/**
 * Get gatherable resources from adjacent tiles
 */
function getGatherableResources(agent: Agent, context: AgentContext): { direction: string; resource: string }[] {
  const resources: { direction: string; resource: string }[] = [];
  const dirOffsets: Record<string, { x: number; y: number }> = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
  };

  for (const [dir, offset] of Object.entries(dirOffsets)) {
    const tx = agent.position.x + offset.x;
    const ty = agent.position.y + offset.y;
    const tile = context.nearbyTiles.find(t => t.position.x === tx && t.position.y === ty);
    if (!tile) continue;

    if (tile.tile.crop && tile.tile.crop.state === CropState.MATURE) {
      resources.push({ direction: dir, resource: 'mature crop (food + seeds)' });
    } else if (tile.tile.resource && tile.tile.resourceAmount && tile.tile.resourceAmount > 0 && !tile.tile.crop) {
      resources.push({ direction: dir, resource: `${tile.tile.resource} (${tile.tile.resourceAmount} left)` });
    }
  }
  return resources;
}

/**
 * Get plantable farmland from adjacent tiles
 */
function getPlantableFarmland(agent: Agent, context: AgentContext): string[] {
  const plantable: string[] = [];
  const dirOffsets: Record<string, { x: number; y: number }> = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
  };

  for (const [dir, offset] of Object.entries(dirOffsets)) {
    const tx = agent.position.x + offset.x;
    const ty = agent.position.y + offset.y;
    const tile = context.nearbyTiles.find(t => t.position.x === tx && t.position.y === ty);
    if (tile && tile.tile.type === TileType.FARMLAND && !tile.tile.crop && !tile.tile.structure) {
      plantable.push(dir);
    }
  }
  return plantable;
}

/**
 * Get available movement directions with destination coordinates
 */
function getAvailableDirectionsWithCoords(agent: Agent, context: AgentContext): { direction: string; x: number; y: number }[] {
  const directions: { direction: string; x: number; y: number }[] = [];
  const dirOffsets: Record<string, { x: number; y: number }> = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
  };

  for (const [dir, offset] of Object.entries(dirOffsets)) {
    const tx = agent.position.x + offset.x;
    const ty = agent.position.y + offset.y;
    const tile = context.nearbyTiles.find(t => t.position.x === tx && t.position.y === ty);
    if (tile && tile.tile.walkable) {
      const occupied = context.nearbyAgents.some(a => a.agent.position.x === tx && a.agent.position.y === ty);
      if (!occupied) {
        directions.push({ direction: dir, x: tx, y: ty });
      }
    }
  }
  return directions;
}

/**
 * Get adjacent mobs that can be attacked
 */
function getAdjacentMobs(agent: Agent, context: AgentContext): { direction: string; mob: { type: string; health: number } }[] {
  const mobs: { direction: string; mob: { type: string; health: number } }[] = [];
  const dirOffsets: Record<string, { x: number; y: number }> = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
  };

  for (const [dir, offset] of Object.entries(dirOffsets)) {
    const tx = agent.position.x + offset.x;
    const ty = agent.position.y + offset.y;
    const mob = context.nearbyMobs.find(m => m.mob.position.x === tx && m.mob.position.y === ty);
    if (mob) {
      mobs.push({ direction: dir, mob: { type: mob.mob.type, health: mob.mob.health } });
    }
  }
  return mobs;
}

/**
 * Get craftable recipes based on inventory and nearby structures
 */
function getCraftableRecipes(agent: Agent, context: AgentContext): typeof CRAFTING_RECIPES {
  const dirOffsets = [
    { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
  ];
  const nearWorkshop = dirOffsets.some(offset => {
    const tile = context.nearbyTiles.find(t =>
      t.position.x === agent.position.x + offset.x &&
      t.position.y === agent.position.y + offset.y
    );
    return tile?.tile.structure?.type === StructureType.WORKSHOP;
  });

  return CRAFTING_RECIPES.filter(recipe => {
    if (recipe.requiresWorkshop && !nearWorkshop) return false;
    return recipe.inputs.every(input => {
      const have = agent.inventory.find(i => i.type === input.type)?.amount || 0;
      return have >= input.amount;
    });
  });
}

/**
 * Parse LLM response into structured format
 */
export function parseLLMResponse(response: string): { thought: string; actions: unknown[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', response);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.thought) {
      console.error('Missing thought in response:', parsed);
      return null;
    }

    let actions: unknown[];
    if (parsed.actions && Array.isArray(parsed.actions)) {
      actions = parsed.actions;
    } else if (parsed.action) {
      actions = [parsed.action];
    } else {
      console.error('Missing actions or action in response:', parsed);
      return null;
    }

    return { thought: parsed.thought, actions };
  } catch (e) {
    console.error('Failed to parse LLM response:', e, response);
    return null;
  }
}
