// ============================================
// Actions System - Validation & Execution
// ============================================

import {
  Action,
  ActionType,
  Agent,
  AgentState,
  AgentRole,
  World,
  Mob,
  MoveAction,
  MoveTowardsAction,
  TravelToAction,
  GatherAction,
  SpeakAction,
  ManageGoalAction,
  BuildAction,
  PlantAction,
  OfferTradeAction,
  AcceptTradeAction,
  RejectTradeAction,
  AssignGoalAction,
  ReadMessageAction,
  EatAction,
  CraftAction,
  AttackAction,
  SimulationLog,
  TileType,
  StructureType,
  CropState,
  ResourceType,
  STRUCTURE_COSTS,
  CRAFTING_RECIPES,
} from '@/types';
import { getNextStepTowards } from '@/utils/pathfinding';
import {
  isWalkable,
  getPositionInDirection,
  getTile,
  harvestResource,
  harvestCrop,
  canBuildAt,
  buildStructure,
  canPlantAt,
  plantCrop,
} from './world';
import {
  moveAgent,
  addToInventory,
  addMemoryEvent,
  addConversation,
  setAgentState,
  setAgentAction,
  addGoal,
  completeGoal,
  updateGoal,
  removeGoal,
  removeFromInventory,
  getInventoryAmount,
  addTradeOffer,
  getTradeOffer,
  removeTradeOffer,
  markMessageRead,
} from './agent';

export interface ActionResult {
  success: boolean;
  message: string;
  logs: SimulationLog[];
  waitTicks?: number; // Additional ticks to wait (for wait action)
  killedMobId?: string; // ID of mob killed by attack action
}

/**
 * Create a simulation log entry
 */
function createLog(
  tick: number,
  type: SimulationLog['type'],
  message: string,
  agentId?: string
): SimulationLog {
  return {
    tick,
    timestamp: new Date(),
    type,
    agentId,
    message,
  };
}

/**
 * Validate if an action can be performed
 */
export function validateAction(
  action: Action,
  agent: Agent,
  world: World,
  agents: Agent[],
  mobs: Mob[] = []
): { valid: boolean; reason?: string } {
  switch (action.type) {
    case ActionType.MOVE: {
      const newPos = getPositionInDirection(agent.position, action.direction);

      // Check bounds first
      if (newPos.x < 0 || newPos.x >= world.width || newPos.y < 0 || newPos.y >= world.height) {
        return {
          valid: false,
          reason: `Cannot move ${action.direction}: position (${newPos.x},${newPos.y}) is outside the world boundaries (0-${world.width-1}, 0-${world.height-1})`
        };
      }

      // Check tile type
      const tile = getTile(world, newPos);
      if (tile && !tile.walkable) {
        return {
          valid: false,
          reason: `Cannot move ${action.direction}: tile at (${newPos.x},${newPos.y}) is ${tile.type} which is not walkable`
        };
      }

      // Check if another agent is there
      const occupant = agents.find(
        (a) => a.id !== agent.id && a.position.x === newPos.x && a.position.y === newPos.y
      );
      if (occupant) {
        return {
          valid: false,
          reason: `Cannot move ${action.direction}: agent "${occupant.name}" is already at position (${newPos.x},${newPos.y})`
        };
      }
      return { valid: true };
    }

    case ActionType.MOVE_TOWARDS: {
      const moveTowardsAction = action as MoveTowardsAction;
      const targetX = moveTowardsAction.x;
      const targetY = moveTowardsAction.y;

      // Check bounds
      if (targetX < 0 || targetX >= world.width || targetY < 0 || targetY >= world.height) {
        return {
          valid: false,
          reason: `Cannot move towards (${targetX},${targetY}): position is outside the world boundaries (0-${world.width-1}, 0-${world.height-1})`
        };
      }

      // Check if already at target
      if (agent.position.x === targetX && agent.position.y === targetY) {
        return {
          valid: false,
          reason: `Already at target position (${targetX},${targetY})`
        };
      }

      // Check if path exists using A*
      const nextStep = getNextStepTowards(world, agent.position, { x: targetX, y: targetY }, agents, agent.id);
      if (!nextStep) {
        return {
          valid: false,
          reason: `No valid path to (${targetX},${targetY}). Target may be blocked or unreachable.`
        };
      }

      return { valid: true };
    }

    case ActionType.TRAVEL_TO: {
      const travelToAction = action as TravelToAction;
      const targetX = travelToAction.x;
      const targetY = travelToAction.y;

      // Check bounds
      if (targetX < 0 || targetX >= world.width || targetY < 0 || targetY >= world.height) {
        return {
          valid: false,
          reason: `Cannot travel to (${targetX},${targetY}): position is outside the world boundaries (0-${world.width-1}, 0-${world.height-1})`
        };
      }

      // Check if already at target
      if (agent.position.x === targetX && agent.position.y === targetY) {
        return {
          valid: false,
          reason: `Already at target position (${targetX},${targetY})`
        };
      }

      // Check if path exists using A*
      const nextStep = getNextStepTowards(world, agent.position, { x: targetX, y: targetY }, agents, agent.id);
      if (!nextStep) {
        return {
          valid: false,
          reason: `No valid path to (${targetX},${targetY}). Target may be blocked or unreachable.`
        };
      }

      return { valid: true };
    }

    case ActionType.GATHER: {
      const targetPos = getPositionInDirection(agent.position, action.direction);

      // Check bounds
      if (targetPos.x < 0 || targetPos.x >= world.width || targetPos.y < 0 || targetPos.y >= world.height) {
        return {
          valid: false,
          reason: `Cannot gather ${action.direction}: position (${targetPos.x},${targetPos.y}) is outside the world boundaries`
        };
      }

      const tile = getTile(world, targetPos);
      if (!tile) {
        return { valid: false, reason: `Cannot gather ${action.direction}: no tile exists at (${targetPos.x},${targetPos.y})` };
      }

      if (!tile.resource) {
        return {
          valid: false,
          reason: `Cannot gather ${action.direction}: tile at (${targetPos.x},${targetPos.y}) is ${tile.type} which has no gatherable resource`
        };
      }

      if (tile.resourceAmount === 0) {
        return {
          valid: false,
          reason: `Cannot gather ${action.direction}: the ${tile.resource} resource at (${targetPos.x},${targetPos.y}) is depleted (0 remaining)`
        };
      }
      return { valid: true };
    }

    case ActionType.SPEAK: {
      if (!action.message || action.message.trim() === '') {
        return { valid: false, reason: 'Cannot speak: message is empty. Provide a non-empty message string.' };
      }
      if (action.targetAgentId) {
        const target = agents.find((a) => a.id === action.targetAgentId);
        if (!target) {
          const availableAgents = agents.filter(a => a.id !== agent.id).map(a => `"${a.name}" (id: ${a.id})`).join(', ');
          return {
            valid: false,
            reason: `Cannot speak to target: no agent found with id "${action.targetAgentId}". Available agents: ${availableAgents || 'none'}`
          };
        }
      }
      return { valid: true };
    }

    case ActionType.OFFER_TRADE: {
      const offerAction = action as OfferTradeAction;
      const target = agents.find((a) => a.id === offerAction.targetAgentId);
      if (!target) {
        const availableAgents = agents.filter(a => a.id !== agent.id).map(a => `"${a.name}" (id: ${a.id})`).join(', ');
        return {
          valid: false,
          reason: `Cannot offer trade: no agent found with id "${offerAction.targetAgentId}". Available agents: ${availableAgents || 'none'}`
        };
      }
      // Check if agents are close enough (within 3 tiles for trading)
      const distance = Math.abs(agent.position.x - target.position.x) +
        Math.abs(agent.position.y - target.position.y);
      if (distance > 3) {
        return {
          valid: false,
          reason: `Cannot offer trade to ${target.name}: you are ${distance} tiles away but must be within 3 tiles. Move closer first.`
        };
      }
      // Check if agent has the resources they're offering
      const hasAmount = getInventoryAmount(agent, offerAction.offerType);
      if (hasAmount < offerAction.offerAmount) {
        return {
          valid: false,
          reason: `Cannot offer ${offerAction.offerAmount} ${offerAction.offerType}: you only have ${hasAmount}`
        };
      }
      return { valid: true };
    }

    case ActionType.ACCEPT_TRADE: {
      const acceptAction = action as AcceptTradeAction;
      const offer = getTradeOffer(agent, acceptAction.offerId);
      if (!offer) {
        const availableOffers = agent.memory.incomingOffers.map(o => `"${o.id}" from ${o.fromAgentName}`).join(', ');
        return {
          valid: false,
          reason: `No trade offer found with id "${acceptAction.offerId}". Your pending offers: ${availableOffers || 'none'}`
        };
      }
      // Check if offer has expired
      if (offer.expiresAt <= world.tick) {
        return {
          valid: false,
          reason: `Trade offer from ${offer.fromAgentName} has expired`
        };
      }
      // Check if agent has what the offer requests
      const hasAmount = getInventoryAmount(agent, offer.requesting.type);
      if (hasAmount < offer.requesting.amount) {
        return {
          valid: false,
          reason: `Cannot accept: offer requests ${offer.requesting.amount} ${offer.requesting.type} but you only have ${hasAmount}`
        };
      }
      // Check if the offering agent still has their side
      const offeringAgent = agents.find(a => a.id === offer.fromAgentId);
      if (!offeringAgent) {
        return { valid: false, reason: `The offering agent ${offer.fromAgentName} no longer exists` };
      }
      const theirAmount = getInventoryAmount(offeringAgent, offer.offering.type);
      if (theirAmount < offer.offering.amount) {
        return {
          valid: false,
          reason: `Cannot accept: ${offer.fromAgentName} no longer has ${offer.offering.amount} ${offer.offering.type} (they have ${theirAmount})`
        };
      }
      return { valid: true };
    }

    case ActionType.REJECT_TRADE: {
      const rejectAction = action as RejectTradeAction;
      const offer = getTradeOffer(agent, rejectAction.offerId);
      if (!offer) {
        const availableOffers = agent.memory.incomingOffers.map(o => `"${o.id}" from ${o.fromAgentName}`).join(', ');
        return {
          valid: false,
          reason: `No trade offer found with id "${rejectAction.offerId}". Your pending offers: ${availableOffers || 'none'}`
        };
      }
      return { valid: true };
    }

    case ActionType.BUILD: {
      const buildAction = action as BuildAction;
      const targetPos = getPositionInDirection(agent.position, buildAction.direction);

      // Check bounds
      if (targetPos.x < 0 || targetPos.x >= world.width || targetPos.y < 0 || targetPos.y >= world.height) {
        return {
          valid: false,
          reason: `Cannot build ${buildAction.direction}: position (${targetPos.x},${targetPos.y}) is outside the world boundaries`
        };
      }

      // Check if buildable
      const buildCheck = canBuildAt(world, targetPos);
      if (!buildCheck.canBuild) {
        return { valid: false, reason: `Cannot build ${buildAction.direction}: ${buildCheck.reason}` };
      }

      // Check if agent has required resources
      const costs = STRUCTURE_COSTS[buildAction.structureType];
      if (!costs) {
        return { valid: false, reason: `Unknown structure type: ${buildAction.structureType}` };
      }

      const missingResources: string[] = [];
      if (costs.wood && getInventoryAmount(agent, ResourceType.WOOD) < costs.wood) {
        missingResources.push(`${costs.wood} wood (have ${getInventoryAmount(agent, ResourceType.WOOD)})`);
      }
      if (costs.stone && getInventoryAmount(agent, ResourceType.STONE) < costs.stone) {
        missingResources.push(`${costs.stone} stone (have ${getInventoryAmount(agent, ResourceType.STONE)})`);
      }

      if (missingResources.length > 0) {
        return { valid: false, reason: `Not enough resources to build ${buildAction.structureType}. Need: ${missingResources.join(', ')}` };
      }

      return { valid: true };
    }

    case ActionType.PLANT: {
      const plantAction = action as PlantAction;
      const targetPos = getPositionInDirection(agent.position, plantAction.direction);

      // Check bounds
      if (targetPos.x < 0 || targetPos.x >= world.width || targetPos.y < 0 || targetPos.y >= world.height) {
        return {
          valid: false,
          reason: `Cannot plant ${plantAction.direction}: position (${targetPos.x},${targetPos.y}) is outside the world boundaries`
        };
      }

      // Check if agent has seeds
      const seedCount = getInventoryAmount(agent, ResourceType.SEED);
      if (seedCount < 1) {
        return {
          valid: false,
          reason: `Cannot plant: you have no seeds. Harvest mature crops to get seeds, or ask someone with seeds.`
        };
      }

      // Check if plantable
      const plantCheck = canPlantAt(world, targetPos);
      if (!plantCheck.canPlant) {
        return { valid: false, reason: `Cannot plant ${plantAction.direction}: ${plantCheck.reason}` };
      }

      return { valid: true };
    }

    case ActionType.WAIT: {
      return { valid: true };
    }

    case ActionType.MANAGE_GOAL: {
      const goalAction = action as ManageGoalAction;
      if (!['add', 'complete', 'update', 'remove'].includes(goalAction.operation)) {
        return {
          valid: false,
          reason: `Invalid goal operation: "${goalAction.operation}". Must be one of: add, complete, update, remove`
        };
      }
      if (goalAction.operation === 'add' && !goalAction.description) {
        return { valid: false, reason: 'Add goal operation requires a "description" field' };
      }
      if (['complete', 'update', 'remove'].includes(goalAction.operation) && !goalAction.goalId) {
        return { valid: false, reason: `${goalAction.operation} goal operation requires a "goalId" field` };
      }
      if (['complete', 'update', 'remove'].includes(goalAction.operation)) {
        const goal = agent.memory.goals.find(g => g.id === goalAction.goalId);
        if (!goal) {
          const availableGoals = agent.memory.goals.map(g => `"${g.id}" (${g.description.slice(0, 20)}...)`).join(', ');
          return {
            valid: false,
            reason: `Goal with id "${goalAction.goalId}" not found. Your goals: ${availableGoals || 'none'}`
          };
        }
      }
      return { valid: true };
    }

    case ActionType.ASSIGN_GOAL: {
      // Only the Leader can assign goals
      if (agent.role !== AgentRole.LEADER) {
        return {
          valid: false,
          reason: `Only the Leader (Chief) can assign goals to other agents. Your role is ${agent.role}.`
        };
      }

      const assignAction = action as AssignGoalAction;

      if (!assignAction.targetAgentId) {
        return { valid: false, reason: 'assign_goal requires "targetAgentId" field' };
      }

      if (!assignAction.goal || assignAction.goal.trim() === '') {
        return { valid: false, reason: 'assign_goal requires a non-empty "goal" field' };
      }

      const target = agents.find(a => a.id === assignAction.targetAgentId);
      if (!target) {
        const availableAgents = agents.filter(a => a.id !== agent.id).map(a => `"${a.name}" (id: ${a.id})`).join(', ');
        return {
          valid: false,
          reason: `No agent found with id "${assignAction.targetAgentId}". Available agents: ${availableAgents || 'none'}`
        };
      }

      if (target.id === agent.id) {
        return { valid: false, reason: 'Cannot assign a goal to yourself. Use manage_goal instead.' };
      }

      return { valid: true };
    }

    case ActionType.READ_MESSAGE: {
      const readAction = action as ReadMessageAction;
      if (!readAction.messageId) {
        return { valid: false, reason: 'read_message requires "messageId" field' };
      }
      const message = agent.memory.conversations.find(m => m.id === readAction.messageId);
      if (!message) {
        const availableMessages = agent.memory.conversations.filter(m => !m.read).map(m => `"${m.id}" from ${m.from}`).join(', ');
        return {
          valid: false,
          reason: `No message found with id "${readAction.messageId}". Unread messages: ${availableMessages || 'none'}`
        };
      }
      return { valid: true };
    }

    case ActionType.EAT: {
      const foodAmount = getInventoryAmount(agent, ResourceType.FOOD);
      if (foodAmount < 1) {
        return { valid: false, reason: 'Cannot eat: you have no food in your inventory.' };
      }
      return { valid: true };
    }

    case ActionType.CRAFT: {
      const craftAction = action as CraftAction;
      const recipe = CRAFTING_RECIPES.find(r => r.id === craftAction.recipeId);
      if (!recipe) {
        const availableRecipes = CRAFTING_RECIPES.map(r => `"${r.id}" (${r.name})`).join(', ');
        return { valid: false, reason: `Unknown recipe: "${craftAction.recipeId}". Available recipes: ${availableRecipes}` };
      }
      // Check inputs
      for (const input of recipe.inputs) {
        const have = getInventoryAmount(agent, input.type);
        if (have < input.amount) {
          return { valid: false, reason: `Cannot craft ${recipe.name}: need ${input.amount} ${input.type} but you have ${have}` };
        }
      }
      // Check workshop requirement
      if (recipe.requiresWorkshop) {
        const dirOffsets = [
          { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
        ];
        const nearWorkshop = dirOffsets.some(offset => {
          const tile = getTile(world, { x: agent.position.x + offset.x, y: agent.position.y + offset.y });
          return tile?.structure?.type === StructureType.WORKSHOP;
        });
        if (!nearWorkshop) {
          return { valid: false, reason: `Cannot craft ${recipe.name}: requires being next to a workshop.` };
        }
      }
      return { valid: true };
    }

    case ActionType.ATTACK: {
      const attackAction = action as AttackAction;
      const targetPos = getPositionInDirection(agent.position, attackAction.direction);
      // Check if a mob is at the target position
      const targetMob = mobs.find(m => m.position.x === targetPos.x && m.position.y === targetPos.y);
      if (!targetMob) {
        return { valid: false, reason: `Cannot attack ${attackAction.direction}: no hostile mob at (${targetPos.x},${targetPos.y}).` };
      }
      return { valid: true };
    }

    default:
      return { valid: false, reason: `Unknown action type: "${(action as any).type}". Valid types are: move, gather, speak, wait, trade, build, plant, eat, craft, attack, manage_goal` };
  }
}

/**
 * Execute an action
 */
export function executeAction(
  action: Action,
  agent: Agent,
  world: World,
  agents: Agent[],
  mobs: Mob[] = []
): ActionResult {
  const logs: SimulationLog[] = [];
  const tick = world.tick;

  // Validate first
  const validation = validateAction(action, agent, world, agents, mobs);
  if (!validation.valid) {
    logs.push(createLog(tick, 'action', `${agent.name} failed: ${validation.reason}`, agent.id));
    // Add failure to agent's memory so they learn from it
    addMemoryEvent(agent, `FAILED: ${action.type} - ${validation.reason}`);
    return { success: false, message: validation.reason!, logs };
  }

  switch (action.type) {
    case ActionType.MOVE: {
      const oldPos = { ...agent.position };
      const newPos = getPositionInDirection(agent.position, action.direction);
      moveAgent(agent, newPos);

      const msg = `${agent.name} moved ${action.direction} from (${oldPos.x},${oldPos.y}) to (${newPos.x},${newPos.y})`;
      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Moved ${action.direction}`);

      return { success: true, message: msg, logs };
    }

    case ActionType.MOVE_TOWARDS: {
      const moveTowardsAction = action as MoveTowardsAction;
      const target = { x: moveTowardsAction.x, y: moveTowardsAction.y };
      const oldPos = { ...agent.position };

      // Use A* pathfinding to get next step
      const nextStep = getNextStepTowards(world, agent.position, target, agents, agent.id);

      if (!nextStep) {
        const failMsg = `No path to (${target.x},${target.y}) - target may be blocked`;
        logs.push(createLog(tick, 'action', `${agent.name} ${failMsg}`, agent.id));
        addMemoryEvent(agent, `FAILED: move_towards (${target.x},${target.y}) - no valid path`);
        return { success: false, message: failMsg, logs };
      }

      // Move one step along the path
      moveAgent(agent, nextStep.nextPosition);

      const distance = Math.abs(target.x - nextStep.nextPosition.x) + Math.abs(target.y - nextStep.nextPosition.y);
      const msg = `${agent.name} moving towards (${target.x},${target.y}): moved ${nextStep.direction} from (${oldPos.x},${oldPos.y}) to (${nextStep.nextPosition.x},${nextStep.nextPosition.y}) [${distance} steps remaining]`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      if (distance === 0) {
        addMemoryEvent(agent, `Arrived at destination (${target.x},${target.y})`);
      } else {
        addMemoryEvent(agent, `Moving towards (${target.x},${target.y}): ${distance} steps remaining`);
      }

      return { success: true, message: msg, logs };
    }

    case ActionType.TRAVEL_TO: {
      const travelToAction = action as TravelToAction;
      const target = { x: travelToAction.x, y: travelToAction.y };
      const oldPos = { ...agent.position };

      // Set persistent travel destination
      agent.travelDestination = target;

      // Use A* pathfinding to get next step
      const nextStep = getNextStepTowards(world, agent.position, target, agents, agent.id);

      if (!nextStep) {
        const failMsg = `No path to (${target.x},${target.y}) - target may be blocked`;
        logs.push(createLog(tick, 'action', `${agent.name} ${failMsg}`, agent.id));
        addMemoryEvent(agent, `FAILED: travel_to (${target.x},${target.y}) - no valid path`);
        agent.travelDestination = null; // Clear destination on failure
        return { success: false, message: failMsg, logs };
      }

      // Move one step along the path
      moveAgent(agent, nextStep.nextPosition);

      const distance = Math.abs(target.x - nextStep.nextPosition.x) + Math.abs(target.y - nextStep.nextPosition.y);
      const msg = `${agent.name} traveling to (${target.x},${target.y}): moved ${nextStep.direction} from (${oldPos.x},${oldPos.y}) to (${nextStep.nextPosition.x},${nextStep.nextPosition.y}) [${distance} steps remaining]`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      if (distance === 0) {
        addMemoryEvent(agent, `Arrived at destination (${target.x},${target.y})`);
        agent.travelDestination = null; // Clear destination on arrival
      } else {
        addMemoryEvent(agent, `Traveling to (${target.x},${target.y}): ${distance} steps remaining`);
      }

      return { success: true, message: msg, logs };
    }

    case ActionType.GATHER: {
      const targetPos = getPositionInDirection(agent.position, action.direction);
      const tile = getTile(world, targetPos)!;

      // Check if this is a crop harvest
      if (tile.crop) {
        if (tile.crop.state !== CropState.MATURE) {
          const failMsg = `Cannot harvest crop - it's still ${tile.crop.state} (matures at tick ${tile.crop.matureAt})`;
          logs.push(createLog(tick, 'action', `${agent.name} ${failMsg}`, agent.id));
          addMemoryEvent(agent, `FAILED: harvest crop - ${failMsg}`);
          return { success: false, message: failMsg, logs };
        }

        const cropResult = harvestCrop(world, targetPos);
        if (cropResult.success) {
          addToInventory(agent, ResourceType.FOOD, cropResult.food);
          addToInventory(agent, ResourceType.SEED, cropResult.seeds);
          const msg = `${agent.name} harvested ${cropResult.food} food and ${cropResult.seeds} seeds from mature crops to the ${action.direction} (farmland ready for replanting)`;
          logs.push(createLog(tick, 'action', msg, agent.id));
          addMemoryEvent(agent, `Harvested ${cropResult.food} food and ${cropResult.seeds} seeds - farmland ready for replanting`);
          return { success: true, message: msg, logs };
        }
      }

      // Regular resource gathering - tools give +1 yield
      const resourceType = tile.resource;
      const hasTools = getInventoryAmount(agent, ResourceType.TOOL) > 0;
      const gatherAmount = hasTools ? 2 : 1;
      const result = harvestResource(world, targetPos, gatherAmount);
      if (result.harvested > 0 && resourceType) {
        addToInventory(agent, resourceType, result.harvested);
        let msg = `${agent.name} gathered ${result.harvested} ${resourceType} from the ${action.direction}`;
        let memoryMsg = `Gathered ${result.harvested} ${resourceType} from ${action.direction}`;
        if (result.depleted) {
          msg += ` (resource fully depleted - tile is now grass)`;
          memoryMsg += ` - FULLY DEPLETED, tile is now grass`;
        }
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, memoryMsg);
        return { success: true, message: msg, logs };
      }
      const failMsg = `Failed to gather from ${action.direction} - resource may be depleted`;
      logs.push(createLog(tick, 'action', `${agent.name} ${failMsg}`, agent.id));
      addMemoryEvent(agent, `FAILED: gather ${action.direction} - ${failMsg}`);
      return { success: false, message: failMsg, logs };
    }

    case ActionType.SPEAK: {
      const speakAction = action as SpeakAction;
      let msg: string;

      if (speakAction.targetAgentId) {
        const target = agents.find((a) => a.id === speakAction.targetAgentId);
        msg = `${agent.name} said to ${target?.name}: "${speakAction.message}"`;
        if (target) {
          addConversation(target, speakAction.message, agent.name);
        }
      } else {
        msg = `${agent.name} announced: "${speakAction.message}"`;
        // Broadcast to all nearby agents
        agents.forEach((a) => {
          if (a.id !== agent.id) {
            addConversation(a, speakAction.message, `${agent.name} (broadcast)`);
          }
        });
      }

      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Spoke: "${speakAction.message}"`);
      return { success: true, message: msg, logs };
    }

    case ActionType.OFFER_TRADE: {
      const offerAction = action as OfferTradeAction;
      const target = agents.find((a) => a.id === offerAction.targetAgentId)!;

      // Create the trade offer
      const offer = addTradeOffer(
        target,
        agent,
        { type: offerAction.offerType, amount: offerAction.offerAmount },
        { type: offerAction.requestType, amount: offerAction.requestAmount },
        tick
      );

      const msg = `${agent.name} offered ${target.name} a trade: ${offerAction.offerAmount} ${offerAction.offerType} for ${offerAction.requestAmount} ${offerAction.requestType} (offer id: ${offer.id})`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      // Notify the target agent
      addConversation(target, `Trade offer: I'll give you ${offerAction.offerAmount} ${offerAction.offerType} for ${offerAction.requestAmount} ${offerAction.requestType}. Use accept_trade or reject_trade with offerId "${offer.id}"`, agent.name);

      addMemoryEvent(agent, `Offered trade to ${target.name}: ${offerAction.offerAmount} ${offerAction.offerType} for ${offerAction.requestAmount} ${offerAction.requestType}`);
      return { success: true, message: msg, logs };
    }

    case ActionType.ACCEPT_TRADE: {
      const acceptAction = action as AcceptTradeAction;
      const offer = getTradeOffer(agent, acceptAction.offerId)!;
      const offeringAgent = agents.find(a => a.id === offer.fromAgentId)!;

      // Transfer items: offering agent gives their items to accepting agent
      removeFromInventory(offeringAgent, offer.offering.type, offer.offering.amount);
      addToInventory(agent, offer.offering.type, offer.offering.amount);

      // Transfer items: accepting agent gives their items to offering agent
      removeFromInventory(agent, offer.requesting.type, offer.requesting.amount);
      addToInventory(offeringAgent, offer.requesting.type, offer.requesting.amount);

      // Remove the offer
      removeTradeOffer(agent, acceptAction.offerId);

      const msg = `${agent.name} accepted trade from ${offer.fromAgentName}: received ${offer.offering.amount} ${offer.offering.type}, gave ${offer.requesting.amount} ${offer.requesting.type}`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      // Notify the offering agent
      addConversation(offeringAgent, `${agent.name} accepted your trade offer! You received ${offer.requesting.amount} ${offer.requesting.type}.`, 'Trade System');

      addMemoryEvent(agent, `Accepted trade: got ${offer.offering.amount} ${offer.offering.type} from ${offer.fromAgentName}`);
      addMemoryEvent(offeringAgent, `Trade accepted: got ${offer.requesting.amount} ${offer.requesting.type} from ${agent.name}`);

      return { success: true, message: msg, logs };
    }

    case ActionType.REJECT_TRADE: {
      const rejectAction = action as RejectTradeAction;
      const offer = getTradeOffer(agent, rejectAction.offerId)!;
      const offeringAgent = agents.find(a => a.id === offer.fromAgentId);

      // Remove the offer
      removeTradeOffer(agent, rejectAction.offerId);

      const msg = `${agent.name} rejected trade offer from ${offer.fromAgentName}`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      // Notify the offering agent
      if (offeringAgent) {
        addConversation(offeringAgent, `${agent.name} rejected your trade offer.`, 'Trade System');
      }

      addMemoryEvent(agent, `Rejected trade offer from ${offer.fromAgentName}`);

      return { success: true, message: msg, logs };
    }

    case ActionType.BUILD: {
      const buildAction = action as BuildAction;
      const targetPos = getPositionInDirection(agent.position, buildAction.direction);
      const costs = STRUCTURE_COSTS[buildAction.structureType];

      // Deduct resources
      if (costs.wood) {
        removeFromInventory(agent, ResourceType.WOOD, costs.wood);
      }
      if (costs.stone) {
        removeFromInventory(agent, ResourceType.STONE, costs.stone);
      }

      // Build the structure
      const result = buildStructure(world, targetPos, buildAction.structureType, agent.id);

      if (result.success) {
        const costStr = Object.entries(costs)
          .filter(([_, amount]) => amount && amount > 0)
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(' and ');
        const msg = `${agent.name} built a ${buildAction.structureType} to the ${buildAction.direction} (used ${costStr})`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `Built ${buildAction.structureType} to the ${buildAction.direction}`);
        return { success: true, message: msg, logs };
      } else {
        const msg = `${agent.name} failed to build: ${result.error}`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `FAILED: build ${buildAction.structureType} - ${result.error}`);
        return { success: false, message: msg, logs };
      }
    }

    case ActionType.PLANT: {
      const plantAction = action as PlantAction;
      const targetPos = getPositionInDirection(agent.position, plantAction.direction);

      // Consume a seed
      removeFromInventory(agent, ResourceType.SEED, 1);

      const result = plantCrop(world, targetPos, agent.id);

      if (result.success) {
        const seedsLeft = getInventoryAmount(agent, ResourceType.SEED);
        const msg = `${agent.name} planted a seed to the ${plantAction.direction} (will mature in 10 ticks, ${seedsLeft} seeds remaining)`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `Planted seed to the ${plantAction.direction} - ${seedsLeft} seeds left`);
        return { success: true, message: msg, logs };
      } else {
        // Refund the seed if planting failed
        addToInventory(agent, ResourceType.SEED, 1);
        const msg = `${agent.name} failed to plant: ${result.error}`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `FAILED: plant - ${result.error}`);
        return { success: false, message: msg, logs };
      }
    }

    case ActionType.WAIT: {
      const waitTicks = action.ticks || 1;
      const msg = `${agent.name} waits for ${waitTicks} tick${waitTicks > 1 ? 's' : ''}: ${action.reason}`;
      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Waited for ${waitTicks} tick${waitTicks > 1 ? 's' : ''}: ${action.reason}`);
      return { success: true, message: msg, logs, waitTicks };
    }

    case ActionType.MANAGE_GOAL: {
      const goalAction = action as ManageGoalAction;
      let msg: string;

      switch (goalAction.operation) {
        case 'add': {
          const newGoal = addGoal(agent, goalAction.description!, tick);
          msg = `${agent.name} added goal: "${goalAction.description}" (id: ${newGoal.id})`;
          addMemoryEvent(agent, `Added goal: "${goalAction.description}"`);
          break;
        }
        case 'complete': {
          const goal = agent.memory.goals.find(g => g.id === goalAction.goalId);
          completeGoal(agent, goalAction.goalId!, tick);
          msg = `${agent.name} completed goal: "${goal?.description}"`;
          addMemoryEvent(agent, `Completed goal: "${goal?.description}"`);
          break;
        }
        case 'update': {
          const oldGoal = agent.memory.goals.find(g => g.id === goalAction.goalId);
          const oldDesc = oldGoal?.description;
          updateGoal(agent, goalAction.goalId!, goalAction.description!);
          msg = `${agent.name} updated goal from "${oldDesc}" to "${goalAction.description}"`;
          addMemoryEvent(agent, `Updated goal to: "${goalAction.description}"`);
          break;
        }
        case 'remove': {
          const goal = agent.memory.goals.find(g => g.id === goalAction.goalId);
          removeGoal(agent, goalAction.goalId!);
          msg = `${agent.name} removed goal: "${goal?.description}"`;
          addMemoryEvent(agent, `Removed goal: "${goal?.description}"`);
          break;
        }
        default:
          msg = `${agent.name} performed unknown goal operation`;
      }

      logs.push(createLog(tick, 'action', msg, agent.id));
      return { success: true, message: msg, logs };
    }

    case ActionType.ASSIGN_GOAL: {
      const assignAction = action as AssignGoalAction;
      const target = agents.find(a => a.id === assignAction.targetAgentId)!;

      // Set the target's assigned goal
      target.assignedGoal = assignAction.goal;
      target.ticksSinceGoalAssigned = 0;

      // Notify the target agent
      addConversation(target, `GOAL ASSIGNED BY CHIEF: ${assignAction.goal}`, agent.name);

      const msg = `${agent.name} assigned goal to ${target.name}: "${assignAction.goal}"`;
      logs.push(createLog(tick, 'action', msg, agent.id));

      addMemoryEvent(agent, `Assigned goal to ${target.name}: "${assignAction.goal}"`);
      addMemoryEvent(target, `Received goal from Chief: "${assignAction.goal}"`);

      return { success: true, message: msg, logs };
    }

    case ActionType.READ_MESSAGE: {
      const readAction = action as ReadMessageAction;
      const message = agent.memory.conversations.find(m => m.id === readAction.messageId)!;

      markMessageRead(agent, readAction.messageId);

      const msg = `${agent.name} read message from ${message.from}`;
      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Read message from ${message.from}: "${message.content.slice(0, 50)}..."`);

      return { success: true, message: msg, logs };
    }

    case ActionType.EAT: {
      removeFromInventory(agent, ResourceType.FOOD, 1);
      const oldHunger = agent.hunger;
      agent.hunger = Math.min(100, agent.hunger + 25);
      const restored = agent.hunger - oldHunger;
      const msg = `${agent.name} ate food (+${restored} hunger, now ${agent.hunger}/100)`;
      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Ate food: hunger ${oldHunger} → ${agent.hunger}`);
      return { success: true, message: msg, logs };
    }

    case ActionType.CRAFT: {
      const craftAction = action as CraftAction;
      const recipe = CRAFTING_RECIPES.find(r => r.id === craftAction.recipeId)!;

      // Consume inputs
      for (const input of recipe.inputs) {
        removeFromInventory(agent, input.type, input.amount);
      }

      // Add output
      addToInventory(agent, recipe.output.type, recipe.output.amount);

      const inputStr = recipe.inputs.map(i => `${i.amount} ${i.type}`).join(' + ');
      const msg = `${agent.name} crafted ${recipe.name}: ${inputStr} → ${recipe.output.amount} ${recipe.output.type}`;
      logs.push(createLog(tick, 'action', msg, agent.id));
      addMemoryEvent(agent, `Crafted ${recipe.name}: got ${recipe.output.amount} ${recipe.output.type}`);
      return { success: true, message: msg, logs };
    }

    case ActionType.ATTACK: {
      const attackAction = action as AttackAction;
      const targetPos = getPositionInDirection(agent.position, attackAction.direction);
      const targetMob = mobs.find(m => m.position.x === targetPos.x && m.position.y === targetPos.y);

      if (!targetMob) {
        const msg = `${agent.name} attacked ${attackAction.direction} but nothing was there`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        return { success: false, message: msg, logs };
      }

      // Deal damage to mob
      const damage = 30;
      targetMob.health -= damage;
      const killed = targetMob.health <= 0;

      if (killed) {
        // Drop food
        const droppedFood = targetMob.dropsFood;
        if (droppedFood > 0) {
          addToInventory(agent, ResourceType.FOOD, droppedFood);
        }
        const msg = `${agent.name} killed a ${targetMob.type}! (+${droppedFood} food)`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `Killed a ${targetMob.type}, got ${droppedFood} food`);
        return { success: true, message: msg, logs, killedMobId: targetMob.id };
      } else {
        const msg = `${agent.name} attacked ${targetMob.type} for ${damage} damage (${targetMob.health} hp remaining)`;
        logs.push(createLog(tick, 'action', msg, agent.id));
        addMemoryEvent(agent, `Attacked ${targetMob.type}: ${targetMob.health} hp remaining`);
        return { success: true, message: msg, logs };
      }
    }

    default:
      return { success: false, message: 'Unknown action', logs };
  }
}

/**
 * Get available actions for an agent based on their position and role
 */
export function getAvailableActions(agent: Agent, world: World, agents: Agent[]): string[] {
  const available: string[] = [];

  // Movement and gather options per direction
  const directions = ['north', 'south', 'east', 'west'] as const;
  for (const dir of directions) {
    const targetPos = getPositionInDirection(agent.position, dir);
    const targetTile = getTile(world, targetPos);

    if (!targetTile) continue;

    if (isWalkable(world, targetPos)) {
      const occupant = agents.find(
        (a) => a.id !== agent.id && a.position.x === targetPos.x && a.position.y === targetPos.y
      );
      if (!occupant) {
        available.push(`move ${dir}`);
      }
    }

    // Gather from adjacent tiles (trees, stones, farmland with mature crops)
    if (targetTile.crop && targetTile.crop.state === CropState.MATURE) {
      available.push(`gather ${dir} (mature crop, ready to harvest)`);
    } else if (targetTile.crop) {
      // Show crop state but can't harvest yet
      available.push(`[${dir}: crop is ${targetTile.crop.state}]`);
    } else if (targetTile.resource && targetTile.resourceAmount && targetTile.resourceAmount > 0) {
      available.push(`gather ${dir} (${targetTile.resource}, ${targetTile.resourceAmount} left)`);
    }

    // Check if can plant (farmland without crops, requires seeds)
    if (targetTile.type === TileType.FARMLAND && !targetTile.crop && !targetTile.structure) {
      const seedCount = getInventoryAmount(agent, ResourceType.SEED);
      if (seedCount > 0) {
        available.push(`plant ${dir} (empty farmland, ${seedCount} seeds)`);
      } else {
        available.push(`[${dir}: farmland - need seeds to plant]`);
      }
    }

    // Check if can build
    const buildCheck = canBuildAt(world, targetPos);
    if (buildCheck.canBuild) {
      // List buildable structures based on inventory
      const woodAmount = getInventoryAmount(agent, ResourceType.WOOD);
      const stoneAmount = getInventoryAmount(agent, ResourceType.STONE);

      const buildableStructures: string[] = [];
      for (const [structType, costs] of Object.entries(STRUCTURE_COSTS)) {
        const needWood = costs.wood || 0;
        const needStone = costs.stone || 0;
        if (woodAmount >= needWood && stoneAmount >= needStone) {
          buildableStructures.push(structType);
        }
      }

      if (buildableStructures.length > 0) {
        available.push(`build ${dir} (${buildableStructures.join(', ')})`);
      }
    }
  }

  // Can always speak
  available.push('speak (announce to all)');

  // Speak to nearby agents
  const nearbyAgents = agents.filter((a) => {
    if (a.id === agent.id) return false;
    const dist = Math.abs(a.position.x - agent.position.x) + Math.abs(a.position.y - agent.position.y);
    return dist <= 5;
  });
  for (const nearby of nearbyAgents) {
    available.push(`speak to ${nearby.name}`);
  }

  // Can always wait
  available.push('wait');

  return available;
}

/**
 * Parse LLM action response into Action object
 * Returns { action, error } - action is null if parsing failed, error explains why
 */
export function parseAction(actionData: unknown): { action: Action | null; error: string | null } {
  if (!actionData) {
    return { action: null, error: 'Action is missing or undefined. Expected an object with "type" field.' };
  }

  if (typeof actionData !== 'object') {
    return { action: null, error: `Action must be an object, but received ${typeof actionData}: ${JSON.stringify(actionData)}` };
  }

  const data = actionData as Record<string, unknown>;

  if (!data.type) {
    return { action: null, error: `Action object is missing "type" field. Received: ${JSON.stringify(data)}. Valid types are: move, gather, speak, wait, trade, build` };
  }

  const validDirections = ['north', 'south', 'east', 'west'];

  switch (data.type) {
    case 'move':
    case ActionType.MOVE:
      if (!data.direction) {
        return { action: null, error: `Move action requires "direction" field. Expected one of: ${validDirections.join(', ')}` };
      }
      if (!validDirections.includes(data.direction as string)) {
        return { action: null, error: `Invalid move direction: "${data.direction}". Must be one of: ${validDirections.join(', ')}` };
      }
      return {
        action: {
          type: ActionType.MOVE,
          direction: data.direction as 'north' | 'south' | 'east' | 'west',
        },
        error: null
      };

    case 'move_towards':
    case ActionType.MOVE_TOWARDS: {
      if (data.x === undefined || data.y === undefined) {
        return { action: null, error: `move_towards action requires "x" and "y" coordinate fields.` };
      }
      const towardsX = Number(data.x);
      const towardsY = Number(data.y);
      if (isNaN(towardsX) || isNaN(towardsY)) {
        return { action: null, error: `move_towards coordinates must be numbers. Received x=${data.x}, y=${data.y}` };
      }
      return {
        action: {
          type: ActionType.MOVE_TOWARDS,
          x: towardsX,
          y: towardsY,
        },
        error: null
      };
    }

    case 'travel_to':
    case ActionType.TRAVEL_TO: {
      if (data.x === undefined || data.y === undefined) {
        return { action: null, error: `travel_to action requires "x" and "y" coordinate fields.` };
      }
      const travelX = Number(data.x);
      const travelY = Number(data.y);
      if (isNaN(travelX) || isNaN(travelY)) {
        return { action: null, error: `travel_to coordinates must be numbers. Received x=${data.x}, y=${data.y}` };
      }
      return {
        action: {
          type: ActionType.TRAVEL_TO,
          x: travelX,
          y: travelY,
        },
        error: null
      };
    }

    case 'gather':
    case ActionType.GATHER:
      if (!data.direction) {
        return { action: null, error: `Gather action requires "direction" field to specify which adjacent tile to gather from. Expected one of: ${validDirections.join(', ')}` };
      }
      if (!validDirections.includes(data.direction as string)) {
        return { action: null, error: `Invalid gather direction: "${data.direction}". Must be one of: ${validDirections.join(', ')}` };
      }
      return {
        action: {
          type: ActionType.GATHER,
          direction: data.direction as 'north' | 'south' | 'east' | 'west',
        },
        error: null
      };

    case 'speak':
    case ActionType.SPEAK:
      if (!data.message || (typeof data.message === 'string' && data.message.trim() === '')) {
        return { action: null, error: 'Speak action requires a non-empty "message" field.' };
      }
      return {
        action: {
          type: ActionType.SPEAK,
          targetAgentId: data.targetAgentId as string | undefined,
          message: (data.message as string) || '',
        },
        error: null
      };

    case 'wait':
    case ActionType.WAIT:
      if (!data.reason) {
        return { action: null, error: 'Wait action requires a "reason" field explaining why you are waiting.' };
      }
      // Parse and validate ticks (1-10, default 1)
      let waitTicks = 1;
      if (data.ticks !== undefined) {
        const parsedTicks = Number(data.ticks);
        if (isNaN(parsedTicks) || parsedTicks < 1 || parsedTicks > 10) {
          return { action: null, error: `Wait action "ticks" must be a number between 1 and 10. Received: ${data.ticks}` };
        }
        waitTicks = Math.floor(parsedTicks);
      }
      return {
        action: {
          type: ActionType.WAIT,
          reason: (data.reason as string) || 'No specific reason',
          ticks: waitTicks,
        },
        error: null
      };

    case 'offer_trade':
    case ActionType.OFFER_TRADE:
      if (!data.targetAgentId) {
        return { action: null, error: 'offer_trade requires "targetAgentId" field specifying which agent to trade with.' };
      }
      if (!data.offerType) {
        return { action: null, error: 'offer_trade requires "offerType" field (resource type you are offering).' };
      }
      if (!data.offerAmount || Number(data.offerAmount) < 1) {
        return { action: null, error: 'offer_trade requires "offerAmount" field (positive number).' };
      }
      if (!data.requestType) {
        return { action: null, error: 'offer_trade requires "requestType" field (resource type you want in return).' };
      }
      if (!data.requestAmount || Number(data.requestAmount) < 1) {
        return { action: null, error: 'offer_trade requires "requestAmount" field (positive number).' };
      }
      return {
        action: {
          type: ActionType.OFFER_TRADE,
          targetAgentId: data.targetAgentId as string,
          offerType: data.offerType as ResourceType,
          offerAmount: Number(data.offerAmount),
          requestType: data.requestType as ResourceType,
          requestAmount: Number(data.requestAmount),
        },
        error: null
      };

    case 'accept_trade':
    case ActionType.ACCEPT_TRADE:
      if (!data.offerId) {
        return { action: null, error: 'accept_trade requires "offerId" field specifying which trade offer to accept.' };
      }
      return {
        action: {
          type: ActionType.ACCEPT_TRADE,
          offerId: data.offerId as string,
        },
        error: null
      };

    case 'reject_trade':
    case ActionType.REJECT_TRADE:
      if (!data.offerId) {
        return { action: null, error: 'reject_trade requires "offerId" field specifying which trade offer to reject.' };
      }
      return {
        action: {
          type: ActionType.REJECT_TRADE,
          offerId: data.offerId as string,
        },
        error: null
      };

    case 'build':
    case ActionType.BUILD:
      if (!data.direction) {
        return { action: null, error: `Build action requires "direction" field. Expected one of: ${validDirections.join(', ')}` };
      }
      if (!validDirections.includes(data.direction as string)) {
        return { action: null, error: `Invalid build direction: "${data.direction}". Must be one of: ${validDirections.join(', ')}` };
      }
      if (!data.structureType) {
        const validStructures = Object.values(StructureType).join(', ');
        return { action: null, error: `Build action requires "structureType" field. Valid types: ${validStructures}` };
      }
      if (!Object.values(StructureType).includes(data.structureType as StructureType)) {
        const validStructures = Object.values(StructureType).join(', ');
        return { action: null, error: `Invalid structureType: "${data.structureType}". Valid types: ${validStructures}` };
      }
      return {
        action: {
          type: ActionType.BUILD,
          direction: data.direction as 'north' | 'south' | 'east' | 'west',
          structureType: data.structureType as StructureType,
        },
        error: null
      };

    case 'plant':
    case ActionType.PLANT:
      if (!data.direction) {
        return { action: null, error: `Plant action requires "direction" field. Expected one of: ${validDirections.join(', ')}` };
      }
      if (!validDirections.includes(data.direction as string)) {
        return { action: null, error: `Invalid plant direction: "${data.direction}". Must be one of: ${validDirections.join(', ')}` };
      }
      return {
        action: {
          type: ActionType.PLANT,
          direction: data.direction as 'north' | 'south' | 'east' | 'west',
        },
        error: null
      };

    case 'manage_goal':
    case ActionType.MANAGE_GOAL:
      const validOps = ['add', 'complete', 'update', 'remove'];
      if (!data.operation || !validOps.includes(data.operation as string)) {
        return {
          action: null,
          error: `manage_goal action requires "operation" field. Must be one of: ${validOps.join(', ')}`
        };
      }
      if (data.operation === 'add' && !data.description) {
        return { action: null, error: 'manage_goal "add" operation requires a "description" field for the new goal.' };
      }
      if (['complete', 'update', 'remove'].includes(data.operation as string) && !data.goalId) {
        return { action: null, error: `manage_goal "${data.operation}" operation requires a "goalId" field.` };
      }
      return {
        action: {
          type: ActionType.MANAGE_GOAL,
          operation: data.operation as 'add' | 'complete' | 'update' | 'remove',
          goalId: data.goalId as string | undefined,
          description: data.description as string | undefined,
        },
        error: null
      };

    case 'assign_goal':
    case ActionType.ASSIGN_GOAL:
      if (!data.targetAgentId) {
        return { action: null, error: 'assign_goal requires "targetAgentId" field specifying which agent to assign the goal to.' };
      }
      if (!data.goal || (typeof data.goal === 'string' && data.goal.trim() === '')) {
        return { action: null, error: 'assign_goal requires a non-empty "goal" field.' };
      }
      return {
        action: {
          type: ActionType.ASSIGN_GOAL,
          targetAgentId: data.targetAgentId as string,
          goal: data.goal as string,
        },
        error: null
      };

    case 'read_message':
    case ActionType.READ_MESSAGE:
      if (!data.messageId) {
        return { action: null, error: 'read_message requires "messageId" field specifying which message to mark as read.' };
      }
      return {
        action: {
          type: ActionType.READ_MESSAGE,
          messageId: data.messageId as string,
        },
        error: null
      };

    case 'eat':
    case ActionType.EAT:
      return {
        action: { type: ActionType.EAT },
        error: null
      };

    case 'craft':
    case ActionType.CRAFT:
      if (!data.recipeId) {
        const availableRecipes = CRAFTING_RECIPES.map(r => `"${r.id}" (${r.name})`).join(', ');
        return { action: null, error: `craft action requires "recipeId" field. Available recipes: ${availableRecipes}` };
      }
      return {
        action: {
          type: ActionType.CRAFT,
          recipeId: data.recipeId as string,
        },
        error: null
      };

    case 'attack':
    case ActionType.ATTACK:
      if (!data.direction) {
        return { action: null, error: `Attack action requires "direction" field. Expected one of: ${validDirections.join(', ')}` };
      }
      if (!validDirections.includes(data.direction as string)) {
        return { action: null, error: `Invalid attack direction: "${data.direction}". Must be one of: ${validDirections.join(', ')}` };
      }
      return {
        action: {
          type: ActionType.ATTACK,
          direction: data.direction as 'north' | 'south' | 'east' | 'west',
        },
        error: null
      };

    default:
      return {
        action: null,
        error: `Unknown action type: "${data.type}". Valid types are: move, gather, speak, wait, offer_trade, accept_trade, reject_trade, build, plant, manage_goal, assign_goal, read_message`
      };
  }
}

/**
 * Validate multiple actions together
 * Rules:
 * - Only ONE move action allowed per turn
 * - Can combine non-movement actions reasonably (e.g., gather + speak, read_message + speak)
 * - Actions are validated in order
 */
export function validateMultipleActions(
  actions: Action[],
  agent: Agent,
  world: World,
  agents: Agent[],
  mobs: Mob[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!actions || actions.length === 0) {
    return { valid: false, errors: ['No actions provided'] };
  }

  // Count action types
  const moveCount = actions.filter(a => a.type === ActionType.MOVE).length;
  const gatherCount = actions.filter(a => a.type === ActionType.GATHER).length;
  const buildCount = actions.filter(a => a.type === ActionType.BUILD).length;
  const plantCount = actions.filter(a => a.type === ActionType.PLANT).length;

  // Rule: Only one move per turn
  if (moveCount > 1) {
    errors.push('Cannot perform multiple move actions in one turn');
  }

  // Rule: Only one gather per turn (can only harvest one thing at a time)
  if (gatherCount > 1) {
    errors.push('Cannot gather from multiple directions in one turn');
  }

  // Rule: Only one build per turn
  if (buildCount > 1) {
    errors.push('Cannot build multiple structures in one turn');
  }

  // Rule: Only one plant per turn
  if (plantCount > 1) {
    errors.push('Cannot plant multiple times in one turn');
  }

  // Rule: Can't move AND do physical actions (gather/build/plant)
  if (moveCount > 0 && (gatherCount > 0 || buildCount > 0 || plantCount > 0)) {
    errors.push('Cannot move and perform physical actions (gather/build/plant) in the same turn');
  }

  // Validate each action individually
  for (let i = 0; i < actions.length; i++) {
    const validation = validateAction(actions[i], agent, world, agents, mobs);
    if (!validation.valid) {
      errors.push(`Action ${i + 1} (${actions[i].type}): ${validation.reason}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Execute multiple actions in order
 * Returns combined results from all actions
 */
export function executeMultipleActions(
  actions: Action[],
  agent: Agent,
  world: World,
  agents: Agent[],
  mobs: Mob[] = []
): ActionResult {
  const allLogs: SimulationLog[] = [];
  const messages: string[] = [];
  let overallSuccess = true;
  let totalWaitTicks = 0;
  const killedMobIds: string[] = [];

  for (const action of actions) {
    const result = executeAction(action, agent, world, agents, mobs);

    allLogs.push(...result.logs);
    messages.push(result.message);

    if (!result.success) {
      overallSuccess = false;
      // Continue executing remaining actions even if one fails
    }

    if (result.waitTicks) {
      totalWaitTicks += result.waitTicks;
    }
    if (result.killedMobId) {
      killedMobIds.push(result.killedMobId);
    }
  }

  return {
    success: overallSuccess,
    message: messages.join('; '),
    logs: allLogs,
    waitTicks: totalWaitTicks > 0 ? totalWaitTicks : undefined,
    killedMobId: killedMobIds[0], // Return first killed mob id
  };
}
