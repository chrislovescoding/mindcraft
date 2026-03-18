// ============================================
// Agent Model - State Machine & Memory
// ============================================

import {
  Agent,
  AgentState,
  AgentRole,
  AgentMemory,
  Position,
  InventoryItem,
  ResourceType,
  Action,
  ExploredTile,
  TileType,
  AgentGoal,
  TradeOffer,
  StructureType,
} from '@/types';

/**
 * Generate a unique agent ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Agent names by role
 */
const ROLE_NAMES: Record<AgentRole, string[]> = {
  [AgentRole.FARMER]: ['Barley', 'Wheat', 'Clover', 'Sage'],
  [AgentRole.MINER]: ['Flint', 'Slate', 'Copper', 'Iron'],
  [AgentRole.GATHERER]: ['Willow', 'Hazel', 'Fern', 'Moss'],
  [AgentRole.TRADER]: ['Sterling', 'Penny', 'Barter', 'Deal'],
  [AgentRole.LEADER]: ['Chief', 'Elder', 'Maven', 'Guide'],
  [AgentRole.BUILDER]: ['Mason', 'Brick', 'Frame', 'Forge'],
};

/**
 * Create a new agent
 */
export function createAgent(role: AgentRole, position: Position, nameIndex: number = 0): Agent {
  const names = ROLE_NAMES[role];
  const name = names[nameIndex % names.length];

  return {
    id: generateId(),
    name,
    role,
    position: { ...position },
    state: AgentState.IDLE,
    health: 100,
    hunger: 80,
    inventory: [],
    memory: createEmptyMemory(),
    currentAction: null,
    lastThought: '',
    decisionCooldown: 0,
    assignedGoal: null,
    ticksSinceGoalAssigned: 0,
    travelDestination: null,
  };
}

/**
 * Create empty agent memory
 */
function createEmptyMemory(): AgentMemory {
  return {
    recentEvents: [],
    conversations: [],
    knownLocations: [],
    thoughts: [],
    previousPositions: [],
    exploredTiles: {},
    goals: [],
    incomingOffers: [],
  };
}

/**
 * Update agent state
 */
export function setAgentState(agent: Agent, state: AgentState): void {
  agent.state = state;
}

/**
 * Set agent's current action
 */
export function setAgentAction(agent: Agent, action: Action | null): void {
  agent.currentAction = action;
}

/**
 * Update agent's last thought and add to thought history
 */
export function setAgentThought(agent: Agent, thought: string): void {
  agent.lastThought = thought;
  agent.memory.thoughts.push(thought);
  // Keep only last 20 thoughts
  if (agent.memory.thoughts.length > 20) {
    agent.memory.thoughts.shift();
  }
}

/**
 * Move agent to a new position
 */
export function moveAgent(agent: Agent, newPosition: Position): void {
  agent.position = { ...newPosition };
}

/**
 * Add item to agent's inventory
 */
export function addToInventory(agent: Agent, type: ResourceType, amount: number): void {
  const existing = agent.inventory.find((item) => item.type === type);
  if (existing) {
    existing.amount += amount;
  } else {
    agent.inventory.push({ type, amount });
  }
}

/**
 * Remove item from agent's inventory
 */
export function removeFromInventory(agent: Agent, type: ResourceType, amount: number): boolean {
  const existing = agent.inventory.find((item) => item.type === type);
  if (!existing || existing.amount < amount) return false;

  existing.amount -= amount;
  if (existing.amount === 0) {
    agent.inventory = agent.inventory.filter((item) => item.type !== type);
  }
  return true;
}

/**
 * Get inventory amount of a resource
 */
export function getInventoryAmount(agent: Agent, type: ResourceType): number {
  const item = agent.inventory.find((i) => i.type === type);
  return item?.amount ?? 0;
}

/**
 * Add event to agent's memory
 */
export function addMemoryEvent(agent: Agent, event: string): void {
  agent.memory.recentEvents.push(event);
  // Keep only last 20 events
  if (agent.memory.recentEvents.length > 20) {
    agent.memory.recentEvents.shift();
  }
}

/**
 * Add conversation to agent's memory
 */
export function addConversation(agent: Agent, content: string, from: string): void {
  const message = {
    id: generateId(),
    content,
    from,
    timestamp: Date.now(),
    read: false,
  };
  agent.memory.conversations.push(message);
  // Keep only last 10 conversations
  if (agent.memory.conversations.length > 10) {
    agent.memory.conversations.shift();
  }
}

/**
 * Mark all messages as read for an agent
 */
export function markAllMessagesRead(agent: Agent): void {
  for (const msg of agent.memory.conversations) {
    msg.read = true;
  }
}

/**
 * Mark a specific message as read
 */
export function markMessageRead(agent: Agent, messageId: string): void {
  const msg = agent.memory.conversations.find(m => m.id === messageId);
  if (msg) {
    msg.read = true;
  }
}

/**
 * Get unread messages count
 */
export function getUnreadCount(agent: Agent): number {
  return agent.memory.conversations.filter(m => !m.read).length;
}

/**
 * Add known location to agent's memory
 */
export function addKnownLocation(agent: Agent, name: string, position: Position): void {
  const existing = agent.memory.knownLocations.find((loc) => loc.name === name);
  if (existing) {
    existing.position = { ...position };
  } else {
    agent.memory.knownLocations.push({ name, position: { ...position } });
  }
}

/**
 * Decrease decision cooldown
 */
export function tickCooldown(agent: Agent): void {
  if (agent.decisionCooldown > 0) {
    agent.decisionCooldown--;
  }
}

/**
 * Set decision cooldown
 */
export function setDecisionCooldown(agent: Agent, ticks: number): void {
  agent.decisionCooldown = ticks;
}

/**
 * Check if agent can make a decision
 */
export function canMakeDecision(agent: Agent): boolean {
  return agent.state === AgentState.IDLE && agent.decisionCooldown === 0;
}

/**
 * Get role description for prompts
 */
export function getRoleDescription(role: AgentRole): string {
  switch (role) {
    case AgentRole.FARMER:
      return 'You are a farmer. You excel at planting seeds on farmland and harvesting mature crops for food. You know the land and seasons well. Look for farmland (near water) to plant crops!';
    case AgentRole.MINER:
      return 'You are a miner. You are skilled at finding and extracting stone and ore from rocky areas.';
    case AgentRole.GATHERER:
      return 'You are a gatherer. You are adept at collecting wood from trees and foraging for natural resources.';
    case AgentRole.TRADER:
      return 'You are a trader. You facilitate exchanges between other agents and know the value of resources.';
    case AgentRole.LEADER:
      return 'You are a leader. You coordinate the efforts of other agents and help assign tasks to achieve goals. Guide your team to gather, build, and farm!';
    case AgentRole.BUILDER:
      return 'You are a builder. You can construct structures (shelter, storage, workshop, well, fence) when you have the required wood and stone.';
  }
}

/**
 * Get role abilities for prompts
 */
export function getRoleAbilities(role: AgentRole): string[] {
  switch (role) {
    case AgentRole.FARMER:
      return ['plant seeds on farmland', 'harvest mature crops for food', 'identify fertile farmland near water'];
    case AgentRole.MINER:
      return ['gather stone and ore efficiently', 'identify mineral deposits'];
    case AgentRole.GATHERER:
      return ['gather wood efficiently', 'forage for food', 'identify resource locations'];
    case AgentRole.TRADER:
      return ['trade with other agents', 'assess resource values'];
    case AgentRole.LEADER:
      return ['coordinate with all agents', 'assign tasks', 'track progress', 'see team goals'];
    case AgentRole.BUILDER:
      return ['build shelter (5 wood)', 'build storage (3 wood)', 'build workshop (4 wood + 2 stone)', 'build well (5 stone)', 'build fence (1 wood)'];
  }
}

/**
 * Record agent's current position before moving
 */
export function recordPosition(agent: Agent): void {
  agent.memory.previousPositions.push({ ...agent.position });
  // Keep only last 5 positions
  if (agent.memory.previousPositions.length > 5) {
    agent.memory.previousPositions.shift();
  }
}

/**
 * Record explored tiles from what the agent can see
 */
export function recordExploredTiles(
  agent: Agent,
  tiles: { position: Position; type: TileType; resource?: ResourceType; resourceAmount?: number; structureType?: StructureType }[],
  currentTick: number
): void {
  for (const tile of tiles) {
    const key = `${tile.position.x},${tile.position.y}`;
    agent.memory.exploredTiles[key] = {
      type: tile.type,
      hasResource: !!tile.resource && (tile.resourceAmount ?? 0) > 0,
      resourceType: tile.resource,
      structureType: tile.structureType,
      lastSeen: currentTick,
    };
  }
}

/**
 * Check if agent has explored a tile
 */
export function hasExplored(agent: Agent, position: Position): boolean {
  const key = `${position.x},${position.y}`;
  return key in agent.memory.exploredTiles;
}

/**
 * Get count of explored tiles
 */
export function getExploredCount(agent: Agent): number {
  return Object.keys(agent.memory.exploredTiles).length;
}

/**
 * Get notable explored locations (resources, water, structures, bridges, etc.)
 */
export function getNotableLocations(agent: Agent): { position: Position; type: TileType; resourceType?: ResourceType; structureType?: StructureType }[] {
  const notable: { position: Position; type: TileType; resourceType?: ResourceType; structureType?: StructureType }[] = [];

  for (const [key, tile] of Object.entries(agent.memory.exploredTiles)) {
    // Include notable tiles: resources, water (barriers), structures, bridges
    const isNotable = tile.hasResource ||
      tile.type === TileType.WATER ||
      tile.type === TileType.BRIDGE ||
      tile.structureType;

    if (isNotable) {
      const [x, y] = key.split(',').map(Number);
      notable.push({
        position: { x, y },
        type: tile.type,
        resourceType: tile.resourceType,
        structureType: tile.structureType,
      });
    }
  }

  return notable;
}

/**
 * Check if agent is potentially stuck in a loop (visiting same positions repeatedly)
 * Only triggers for actual back-and-forth movement, not for staying in place
 */
export function isInMovementLoop(agent: Agent): boolean {
  const positions = agent.memory.previousPositions;
  if (positions.length < 4) return false;

  const last4 = positions.slice(-4);
  const posStr = last4.map(p => `${p.x},${p.y}`);

  // If all positions are the same, agent is staying still (waiting) - not a loop
  const allSame = posStr.every(p => p === posStr[0]);
  if (allSame) return false;

  // Check if last 4 positions form a back-and-forth pattern like A-B-A-B
  if (posStr[0] === posStr[2] && posStr[1] === posStr[3] && posStr[0] !== posStr[1]) {
    return true;
  }

  // Pattern like A-B-C-B (going back immediately) but not staying still
  if (posStr[1] === posStr[3] && posStr[1] !== posStr[2]) {
    return true;
  }

  return false;
}

/**
 * Add a goal to agent's goal list
 */
export function addGoal(agent: Agent, description: string, currentTick: number): AgentGoal {
  const goal: AgentGoal = {
    id: generateId(),
    description,
    status: 'pending',
    createdAt: currentTick,
  };
  agent.memory.goals.push(goal);
  // Keep only last 10 goals (including completed)
  if (agent.memory.goals.length > 10) {
    // Remove oldest completed goal, or oldest goal if none completed
    const completedIndex = agent.memory.goals.findIndex(g => g.status === 'completed');
    if (completedIndex >= 0) {
      agent.memory.goals.splice(completedIndex, 1);
    } else {
      agent.memory.goals.shift();
    }
  }
  return goal;
}

/**
 * Complete a goal
 */
export function completeGoal(agent: Agent, goalId: string, currentTick: number): boolean {
  const goal = agent.memory.goals.find(g => g.id === goalId);
  if (!goal) return false;
  goal.status = 'completed';
  goal.completedAt = currentTick;
  return true;
}

/**
 * Update a goal's description
 */
export function updateGoal(agent: Agent, goalId: string, newDescription: string): boolean {
  const goal = agent.memory.goals.find(g => g.id === goalId);
  if (!goal) return false;
  goal.description = newDescription;
  return true;
}

/**
 * Remove a goal
 */
export function removeGoal(agent: Agent, goalId: string): boolean {
  const index = agent.memory.goals.findIndex(g => g.id === goalId);
  if (index < 0) return false;
  agent.memory.goals.splice(index, 1);
  return true;
}

/**
 * Set a goal to in_progress
 */
export function startGoal(agent: Agent, goalId: string): boolean {
  const goal = agent.memory.goals.find(g => g.id === goalId);
  if (!goal) return false;
  goal.status = 'in_progress';
  return true;
}

/**
 * Get active goals (pending or in_progress)
 */
export function getActiveGoals(agent: Agent): AgentGoal[] {
  return agent.memory.goals.filter(g => g.status !== 'completed');
}

/**
 * Get completed goals
 */
export function getCompletedGoals(agent: Agent): AgentGoal[] {
  return agent.memory.goals.filter(g => g.status === 'completed');
}

/**
 * Get agent summary for logging
 */
export function getAgentSummary(agent: Agent): string {
  const inventoryStr = agent.inventory.length > 0
    ? agent.inventory.map((i) => `${i.type}:${i.amount}`).join(', ')
    : 'empty';

  return `[${agent.name}] (${agent.role}) @ (${agent.position.x},${agent.position.y}) | ` +
    `State: ${agent.state} | Inventory: ${inventoryStr}`;
}

// ============================================
// Trade Offer Management
// ============================================

const TRADE_OFFER_EXPIRY_TICKS = 15; // Offers expire after 15 ticks

/**
 * Add a trade offer to an agent
 */
export function addTradeOffer(
  targetAgent: Agent,
  fromAgent: Agent,
  offering: { type: ResourceType; amount: number },
  requesting: { type: ResourceType; amount: number },
  currentTick: number
): TradeOffer {
  const offer: TradeOffer = {
    id: generateId(),
    fromAgentId: fromAgent.id,
    fromAgentName: fromAgent.name,
    toAgentId: targetAgent.id,
    toAgentName: targetAgent.name,
    offering,
    requesting,
    createdAt: currentTick,
    expiresAt: currentTick + TRADE_OFFER_EXPIRY_TICKS,
  };

  targetAgent.memory.incomingOffers.push(offer);
  return offer;
}

/**
 * Get a trade offer by ID
 */
export function getTradeOffer(agent: Agent, offerId: string): TradeOffer | undefined {
  return agent.memory.incomingOffers.find(o => o.id === offerId);
}

/**
 * Remove a trade offer (after accept/reject/expire)
 */
export function removeTradeOffer(agent: Agent, offerId: string): boolean {
  const index = agent.memory.incomingOffers.findIndex(o => o.id === offerId);
  if (index >= 0) {
    agent.memory.incomingOffers.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Remove expired trade offers from an agent
 */
export function removeExpiredOffers(agent: Agent, currentTick: number): number {
  const before = agent.memory.incomingOffers.length;
  agent.memory.incomingOffers = agent.memory.incomingOffers.filter(o => o.expiresAt > currentTick);
  return before - agent.memory.incomingOffers.length;
}

/**
 * Get all pending (non-expired) offers for an agent
 */
export function getPendingOffers(agent: Agent, currentTick: number): TradeOffer[] {
  return agent.memory.incomingOffers.filter(o => o.expiresAt > currentTick);
}
