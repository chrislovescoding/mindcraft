// ============================================
// Simulation Loop - Main Game Orchestration
// ============================================

import {
  Agent,
  AgentState,
  AgentRole,
  World,
  Mob,
  MobType,
  SimulationState,
  SimulationConfig,
  SimulationLog,
  AgentContext,
  AgentGoal,
  ResourceType,
  Recording,
  RecordedTick,
  RecordedAgentState,
  RecordedSpeech,
  RecordedEvent,
  ActionType,
  SpeakAction,
  MoveTowardsAction,
  TravelToAction,
  AttackAction,
} from '@/types';
import { generateWorld, getNearbyTiles, getDistance, getWorldSummary, processCropGrowth, findSpawnPositions, getTimeOfDay, isNighttime, isWalkable } from './world';
import {
  createAgent,
  setAgentState,
  setAgentThought,
  setAgentAction,
  tickCooldown,
  setDecisionCooldown,
  canMakeDecision,
  getAgentSummary,
  addConversation,
  markAllMessagesRead,
  recordPosition,
  recordExploredTiles,
  removeExpiredOffers,
  moveAgent,
  addMemoryEvent,
} from './agent';
import { executeAction, validateAction, validateMultipleActions, executeMultipleActions, parseAction } from './actions';
import { getNextStepTowards } from '@/utils/pathfinding';
import { ILLMProvider, createLLMProvider, MockLLMProvider } from '@/llm/provider';
import { buildSystemPrompt, buildContextPrompt } from '@/llm/prompts';

/**
 * Default simulation configuration
 */
export const DEFAULT_CONFIG: SimulationConfig = {
  worldWidth: 20,
  worldHeight: 20,
  tickIntervalMs: 2000,
  decisionCooldownTicks: 3,
  llmProvider: 'openai',
};

/**
 * Simulation class - orchestrates the entire simulation
 */
export class Simulation {
  private state: SimulationState;
  private config: SimulationConfig;
  private llmProvider: ILLMProvider | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private onLogCallback: ((log: SimulationLog) => void) | null = null;
  private onStateChangeCallback: ((state: SimulationState) => void) | null = null;

  // Recording state
  private recording: Recording | null = null;
  private isRecording: boolean = false;
  private currentTickEvents: RecordedEvent[] = [];
  private currentTickSpeeches: RecordedSpeech[] = [];
  private onRecordingUpdateCallback: ((recording: Recording) => void) | null = null;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create the initial simulation state
   */
  private createInitialState(): SimulationState {
    const world = generateWorld(this.config.worldWidth, this.config.worldHeight);

    // Find grass tiles for spawning agents
    const spawnPositions = findSpawnPositions(world, 3);

    const agents: Agent[] = [
      createAgent(AgentRole.GATHERER, spawnPositions[0] || { x: 0, y: 0 }, 0),
      createAgent(AgentRole.FARMER, spawnPositions[1] || { x: 1, y: 0 }, 0),
      createAgent(AgentRole.LEADER, spawnPositions[2] || { x: 2, y: 0 }, 0),
    ];

    // Give the farmer (Barley) starting seeds
    const farmer = agents.find(a => a.role === AgentRole.FARMER);
    if (farmer) {
      farmer.inventory.push({ type: ResourceType.SEED, amount: 5 });
    }

    return {
      world,
      agents,
      mobs: [],
      worldGoal: 'Explore the world and gather resources. Work together to collect wood and food.',
      isRunning: false,
      logs: [],
    };
  }

  /**
   * Initialize the LLM provider
   */
  async initialize(): Promise<void> {
    try {
      this.llmProvider = await createLLMProvider({
        provider: this.config.llmProvider,
        model: this.config.llmModel,
      });
      this.log('system', `Initialized ${this.config.llmProvider} LLM provider`);
    } catch (error) {
      console.error('Failed to initialize LLM provider, using mock:', error);
      this.llmProvider = new MockLLMProvider();
      this.log('system', 'Using mock LLM provider (no API key configured)');
    }

    // Log initial world state
    this.log('world', getWorldSummary(this.state.world));
    for (const agent of this.state.agents) {
      this.log('agent', getAgentSummary(agent), agent.id);
    }
  }

  /**
   * Start the simulation
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.log('system', 'Simulation started');
    this.notifyStateChange();

    this.tickInterval = setInterval(() => this.tick(), this.config.tickIntervalMs);
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    if (!this.state.isRunning) return;

    this.state.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.log('system', 'Simulation stopped');
    this.notifyStateChange();
  }

  /**
   * Main simulation tick
   */
  private async tick(): Promise<void> {
    this.state.world.tick++;
    const tick = this.state.world.tick;

    // Update time of day
    const prevTime = this.state.world.timeOfDay;
    this.state.world.timeOfDay = getTimeOfDay(tick);
    if (prevTime !== this.state.world.timeOfDay) {
      this.log('world', `Time changed: ${prevTime} → ${this.state.world.timeOfDay}`);
    }

    this.log('system', `--- Tick ${tick} (${this.state.world.timeOfDay}) ---`);

    // Process crop growth
    const cropResults = processCropGrowth(this.state.world);
    if (cropResults.grownCrops.length > 0) {
      this.log('world', `Crops growing: ${cropResults.grownCrops.length} crops are now sprouting`);
    }
    if (cropResults.maturedCrops.length > 0) {
      this.log('world', `Crops matured: ${cropResults.maturedCrops.length} crops are ready to harvest!`);
    }

    // Process hunger and health for each agent
    for (const agent of this.state.agents) {
      if (agent.health <= 0) continue; // Skip dead agents

      agent.hunger = Math.max(0, agent.hunger - 1);

      if (agent.hunger === 0) {
        agent.health = Math.max(0, agent.health - 2);
        if (agent.health <= 0) {
          this.log('agent', `${agent.name} has died from starvation!`, agent.id);
          addMemoryEvent(agent, 'DIED from starvation');
        } else if (agent.health <= 20) {
          this.log('agent', `${agent.name} is starving! Health: ${agent.health}`, agent.id);
        }
      }
    }

    // Process mob spawning and AI
    this.processMobs();

    // Clean up expired trade offers and track goal-less ticks
    for (const agent of this.state.agents) {
      if (agent.health <= 0) continue;

      const expired = removeExpiredOffers(agent, tick);
      if (expired > 0) {
        this.log('system', `${expired} trade offer(s) expired for ${agent.name}`);
      }

      // Track how long agents have been without a goal
      if (!agent.assignedGoal && agent.role !== AgentRole.LEADER) {
        agent.ticksSinceGoalAssigned++;
      }
    }

    // Process each agent
    for (const agent of this.state.agents) {
      // Skip dead agents
      if (agent.health <= 0) continue;
      // Decrease cooldown
      tickCooldown(agent);

      // Process persistent travel (travel_to action continues each tick)
      if (agent.travelDestination && agent.state === AgentState.IDLE) {
        this.processPersistentTravel(agent);
      }

      // Skip if agent is already thinking or acting
      if (agent.state !== AgentState.IDLE) {
        this.log('agent', `${agent.name} is ${agent.state}`, agent.id);
        continue;
      }

      // Check if agent can make a decision
      if (!canMakeDecision(agent)) {
        this.log('agent', `${agent.name} cooling down (${agent.decisionCooldown} ticks)`, agent.id);
        continue;
      }

      // Start decision process
      this.processAgentDecision(agent);
    }

    // Record this tick if recording
    this.recordTick();

    this.notifyStateChange();
  }

  /**
   * Process an agent's decision (async)
   */
  private async processAgentDecision(agent: Agent): Promise<void> {
    if (!this.llmProvider) return;

    // Set thinking state
    setAgentState(agent, AgentState.THINKING);
    this.log('agent', `${agent.name} is thinking...`, agent.id);
    this.notifyStateChange();

    try {
      // Build context for the agent
      const context = this.buildAgentContext(agent);

      // Get decision from LLM
      const decision = await this.llmProvider.generateDecision(agent, context);

      // Log the thought
      setAgentThought(agent, decision.thought);
      this.log('llm', `${agent.name} thinks: "${decision.thought}"`, agent.id);

      // Get actions array (support both single action and array for backwards compat)
      const actions = decision.actions;

      if (!actions || actions.length === 0) {
        this.log('agent', `${agent.name} decided to take no action`, agent.id);
        setAgentState(agent, AgentState.IDLE);
        setAgentAction(agent, null);
        setDecisionCooldown(agent, this.config.decisionCooldownTicks);
        this.notifyStateChange();
        return;
      }

      // Validate the combination of actions
      const validation = validateMultipleActions(actions, agent, this.state.world, this.state.agents, this.state.mobs);
      if (!validation.valid) {
        this.log('action', `${agent.name} invalid action combination: ${validation.errors.join('; ')}`, agent.id);
        setAgentState(agent, AgentState.IDLE);
        setAgentAction(agent, null);
        setDecisionCooldown(agent, this.config.decisionCooldownTicks);
        this.notifyStateChange();
        return;
      }

      // Set acting state (show first action)
      setAgentState(agent, AgentState.ACTING);
      setAgentAction(agent, actions[0]);
      this.notifyStateChange();

      // Record current position before executing actions (for movement tracking)
      recordPosition(agent);

      // Execute all actions in order
      const result = executeMultipleActions(
        actions,
        agent,
        this.state.world,
        this.state.agents,
        this.state.mobs
      );

      // Remove killed mobs
      if (result.killedMobId) {
        this.state.mobs = this.state.mobs.filter(m => m.id !== result.killedMobId);
      }

      // Log results
      for (const log of result.logs) {
        this.addLog(log);
      }

      // Record events and speeches for playback
      if (this.isRecording) {
        for (const action of actions) {
          this.recordActionEvent(agent, action);
        }
      }

      // Mark all messages as read since agent has now processed them
      markAllMessagesRead(agent);

      // Return to idle and set cooldown
      // If wait action specified extra ticks, add them to the cooldown
      const extraWaitTicks = result.waitTicks ? result.waitTicks - 1 : 0; // -1 because base cooldown already counts as 1
      setAgentState(agent, AgentState.IDLE);
      setAgentAction(agent, null);
      setDecisionCooldown(agent, this.config.decisionCooldownTicks + extraWaitTicks);

      // Log final state
      this.log('agent', getAgentSummary(agent), agent.id);
    } catch (error) {
      console.error(`Error processing agent ${agent.name}:`, error);
      setAgentState(agent, AgentState.IDLE);
      setAgentAction(agent, null);
      this.log('agent', `${agent.name} encountered an error`, agent.id);
    }

    this.notifyStateChange();
  }

  /**
   * Process mob spawning, AI, and attacks
   */
  private processMobs(): void {
    const world = this.state.world;
    const agents = this.state.agents.filter(a => a.health > 0);
    const timeOfDay = world.timeOfDay;

    // Despawn mobs at dawn
    if (timeOfDay === 'dawn' && this.state.mobs.length > 0) {
      this.log('world', `Dawn breaks - ${this.state.mobs.length} hostile mob(s) flee!`);
      this.state.mobs = [];
      return;
    }

    // Spawn mobs at night (max 3)
    if (timeOfDay === 'night' && this.state.mobs.length < 3 && Math.random() < 0.3) {
      this.spawnMob();
    }

    // Process mob AI
    for (const mob of this.state.mobs) {
      // Find nearest agent
      let nearestAgent: Agent | null = null;
      let nearestDist = Infinity;
      for (const agent of agents) {
        const dist = getDistance(mob.position, agent.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestAgent = agent;
        }
      }

      if (!nearestAgent) continue;

      // If adjacent, attack
      if (nearestDist === 1) {
        nearestAgent.health = Math.max(0, nearestAgent.health - mob.damage);
        this.log('world', `${mob.type} attacked ${nearestAgent.name} for ${mob.damage} damage! (health: ${nearestAgent.health})`, nearestAgent.id);
        addMemoryEvent(nearestAgent, `ATTACKED by ${mob.type}! Lost ${mob.damage} health (${nearestAgent.health} remaining)`);

        if (nearestAgent.health <= 0) {
          this.log('agent', `${nearestAgent.name} was killed by a ${mob.type}!`, nearestAgent.id);
        }

        // Record attack event
        if (this.isRecording) {
          this.currentTickEvents.push({
            type: 'attack',
            agentId: nearestAgent.id,
            agentName: nearestAgent.name,
            description: `${mob.type} attacked ${nearestAgent.name} for ${mob.damage} damage`,
            data: { mobType: mob.type, damage: mob.damage, remainingHealth: nearestAgent.health },
          });
        }
        continue;
      }

      // Move toward nearest agent (simple: step in closest direction)
      if (nearestDist <= 8) {
        const dx = nearestAgent.position.x - mob.position.x;
        const dy = nearestAgent.position.y - mob.position.y;
        let newPos = { ...mob.position };

        // Try to move in the direction with the largest delta
        if (Math.abs(dx) >= Math.abs(dy)) {
          newPos.x += dx > 0 ? 1 : -1;
        } else {
          newPos.y += dy > 0 ? 1 : -1;
        }

        // Check if new position is valid (walkable, not occupied by another mob or agent)
        if (
          isWalkable(world, newPos) &&
          !this.state.mobs.some(m => m.id !== mob.id && m.position.x === newPos.x && m.position.y === newPos.y) &&
          !agents.some(a => a.position.x === newPos.x && a.position.y === newPos.y)
        ) {
          mob.position = newPos;
        }
      }
    }
  }

  /**
   * Spawn a hostile mob on a walkable tile far from agents
   */
  private spawnMob(): void {
    const world = this.state.world;
    const agents = this.state.agents.filter(a => a.health > 0);

    // Try up to 20 times to find a valid spawn position
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Math.floor(Math.random() * world.width);
      const y = Math.floor(Math.random() * world.height);

      if (!isWalkable(world, { x, y })) continue;

      // Must be far from all agents (>5 tiles)
      const tooClose = agents.some(a => getDistance(a.position, { x, y }) <= 5);
      if (tooClose) continue;

      // Must not be on another mob
      if (this.state.mobs.some(m => m.position.x === x && m.position.y === y)) continue;

      const mobType = Math.random() < 0.5 ? MobType.WOLF : MobType.SKELETON;
      const mob: Mob = {
        id: `mob_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type: mobType,
        position: { x, y },
        health: mobType === MobType.WOLF ? 40 : 60,
        damage: mobType === MobType.WOLF ? 8 : 5,
        dropsFood: mobType === MobType.WOLF ? 2 : 1,
      };

      this.state.mobs.push(mob);
      this.log('world', `A wild ${mobType} appeared at (${x},${y})!`);
      return;
    }
  }

  /**
   * Process persistent travel for an agent (one step per tick)
   */
  private processPersistentTravel(agent: Agent): void {
    const target = agent.travelDestination;
    if (!target) return;

    const oldPos = { ...agent.position };

    // Check if already at destination
    if (agent.position.x === target.x && agent.position.y === target.y) {
      this.log('agent', `${agent.name} arrived at destination (${target.x},${target.y})`, agent.id);
      addMemoryEvent(agent, `Arrived at destination (${target.x},${target.y})`);
      agent.travelDestination = null;
      return;
    }

    // Get next step using A* pathfinding
    const nextStep = getNextStepTowards(
      this.state.world,
      agent.position,
      target,
      this.state.agents,
      agent.id
    );

    if (!nextStep) {
      // Path blocked - notify agent and clear destination
      this.log('agent', `${agent.name} travel blocked - no path to (${target.x},${target.y})`, agent.id);
      addMemoryEvent(agent, `Travel to (${target.x},${target.y}) blocked - path obstructed`);
      agent.travelDestination = null;
      return;
    }

    // Move one step
    recordPosition(agent);
    moveAgent(agent, nextStep.nextPosition);

    const distance = Math.abs(target.x - nextStep.nextPosition.x) + Math.abs(target.y - nextStep.nextPosition.y);
    this.log('agent', `${agent.name} traveling to (${target.x},${target.y}): moved ${nextStep.direction} [${distance} steps remaining]`, agent.id);

    // Record the movement for playback
    if (this.isRecording) {
      this.currentTickEvents.push({
        type: 'move',
        agentId: agent.id,
        agentName: agent.name,
        description: `Traveling to (${target.x},${target.y}): moved ${nextStep.direction}`,
        data: { from: oldPos, to: nextStep.nextPosition, target, remaining: distance },
      });
    }

    // Check if arrived
    if (distance === 0) {
      this.log('agent', `${agent.name} arrived at destination (${target.x},${target.y})`, agent.id);
      addMemoryEvent(agent, `Arrived at destination (${target.x},${target.y})`);
      agent.travelDestination = null;
    }
  }

  /**
   * Build context for an agent's decision
   */
  private buildAgentContext(agent: Agent): AgentContext {
    // Reduced visibility at night
    const visRadius = isNighttime(this.state.world.timeOfDay) ? 1 : 2;
    const nearbyTiles = getNearbyTiles(this.state.world, agent.position, visRadius);

    // Record explored tiles from what the agent can see
    recordExploredTiles(
      agent,
      nearbyTiles.map(t => ({
        position: t.position,
        type: t.tile.type,
        resource: t.tile.resource,
        resourceAmount: t.tile.resourceAmount,
        structureType: t.tile.structure?.type,
      })),
      this.state.world.tick
    );

    const nearbyAgents = this.state.agents
      .filter((a) => a.id !== agent.id)
      .map((a) => ({
        agent: a,
        distance: getDistance(agent.position, a.position),
      }))
      .filter((a) => a.distance <= 10)
      .sort((a, b) => a.distance - b.distance);

    const recentMessages = agent.memory.conversations.slice(-5).map((msg) => ({
      from: msg.from,
      message: msg.content,
      read: msg.read,
    }));

    // Leaders can see everyone's goals and assigned goals
    let teamGoals: { agentId: string; agentName: string; agentRole: AgentRole; assignedGoal: string | null; goals: AgentGoal[] }[] | undefined;
    if (agent.role === AgentRole.LEADER) {
      teamGoals = this.state.agents
        .filter(a => a.id !== agent.id)
        .map(a => ({
          agentId: a.id,
          agentName: a.name,
          agentRole: a.role,
          assignedGoal: a.assignedGoal,
          goals: a.memory.goals,
        }));
    }

    // Find nearby mobs
    const nearbyMobs = this.state.mobs
      .map((mob) => ({
        mob,
        distance: getDistance(agent.position, mob.position),
      }))
      .filter((m) => m.distance <= 5)
      .sort((a, b) => a.distance - b.distance);

    return {
      worldGoal: this.state.worldGoal,
      nearbyTiles,
      nearbyAgents,
      nearbyMobs,
      recentMessages,
      timeOfDay: this.state.world.timeOfDay,
      teamGoals,
    };
  }

  /**
   * Add a log entry
   */
  private log(
    type: SimulationLog['type'],
    message: string,
    agentId?: string
  ): void {
    const log: SimulationLog = {
      tick: this.state.world.tick,
      timestamp: new Date(),
      type,
      agentId,
      message,
    };
    this.addLog(log);
  }

  /**
   * Add a log and notify
   */
  private addLog(log: SimulationLog): void {
    this.state.logs.push(log);
    // Keep only last 200 logs
    if (this.state.logs.length > 200) {
      this.state.logs.shift();
    }
    this.onLogCallback?.(log);
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    this.onStateChangeCallback?.({ ...this.state });
  }

  /**
   * Set log callback
   */
  onLog(callback: (log: SimulationLog) => void): void {
    this.onLogCallback = callback;
  }

  /**
   * Set state change callback
   */
  onStateChange(callback: (state: SimulationState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Set world goal (context for Chief)
   */
  setWorldGoal(goal: string): void {
    const oldGoal = this.state.worldGoal;
    this.state.worldGoal = goal;

    // Notify Chief about the world goal change
    const chief = this.state.agents.find(a => a.role === AgentRole.LEADER);
    if (chief && goal !== oldGoal) {
      addConversation(chief, `NEW WORLD GOAL: ${goal}. As leader, coordinate your team to achieve this.`, 'System');
    }

    this.log('system', `World goal set: ${goal}`);
    this.notifyStateChange();
  }

  /**
   * Set an individual agent's goal
   */
  setAgentGoal(agentId: string, goal: string | null): void {
    const agent = this.state.agents.find(a => a.id === agentId);
    if (!agent) return;

    const oldGoal = agent.assignedGoal;
    agent.assignedGoal = goal;
    agent.ticksSinceGoalAssigned = 0;

    if (goal) {
      addConversation(agent, `NEW GOAL ASSIGNED: ${goal}`, 'User');
      this.log('system', `Goal assigned to ${agent.name}: ${goal}`);
    } else if (oldGoal) {
      addConversation(agent, `Your goal has been cleared.`, 'User');
      this.log('system', `Goal cleared for ${agent.name}`);
    }

    this.notifyStateChange();
  }

  /**
   * Get current state
   */
  getState(): SimulationState {
    return { ...this.state };
  }

  /**
   * Get config
   */
  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  /**
   * Reset simulation
   */
  reset(): void {
    this.stop();
    this.state = this.createInitialState();
    this.log('system', 'Simulation reset');
    this.log('world', getWorldSummary(this.state.world));
    for (const agent of this.state.agents) {
      this.log('agent', getAgentSummary(agent), agent.id);
    }
    this.notifyStateChange();
  }

  /**
   * Set tick speed (interval in ms)
   */
  setTickSpeed(intervalMs: number): void {
    this.config.tickIntervalMs = intervalMs;
    // If running, restart with new interval
    if (this.state.isRunning) {
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
      }
      this.tickInterval = setInterval(() => this.tick(), this.config.tickIntervalMs);
    }
    this.log('system', `Tick speed set to ${intervalMs}ms`);
  }

  /**
   * Get tick speed
   */
  getTickSpeed(): number {
    return this.config.tickIntervalMs;
  }

  /**
   * Set the LLM model (re-initializes provider)
   */
  async setModel(model: string): Promise<void> {
    this.config.llmModel = model;
    try {
      this.llmProvider = await createLLMProvider({
        provider: this.config.llmProvider,
        model,
      });
      this.log('system', `Model changed to ${model}`);
    } catch (error) {
      console.error('Failed to change model:', error);
    }
  }

  /**
   * Get current model
   */
  getModel(): string | undefined {
    return this.config.llmModel;
  }

  /**
   * Get mobs list
   */
  getMobs(): Mob[] {
    return [...this.state.mobs];
  }

  /**
   * Get agent context (what an agent can "see")
   */
  getAgentContext(agentId: string): AgentContext | null {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) return null;
    return this.buildAgentContext(agent);
  }

  /**
   * Send a message from the user to a specific agent
   */
  sendMessageToAgent(agentId: string, message: string): void {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) return;

    addConversation(agent, message, 'User');

    this.log('system', `User to ${agent.name}: "${message}"`);

    // Record user message as an event
    if (this.isRecording) {
      this.currentTickEvents.push({
        type: 'other',
        agentId: agent.id,
        agentName: agent.name,
        description: `User sent message: "${message}"`,
        data: { userMessage: message },
      });
    }

    this.notifyStateChange();
  }

  /**
   * Broadcast a message from the user to all agents
   */
  broadcastMessage(message: string): void {
    for (const agent of this.state.agents) {
      addConversation(agent, message, 'User (broadcast)');
    }

    this.log('system', `User broadcast: "${message}"`);
    this.notifyStateChange();
  }

  /**
   * Get the full prompt that would be sent to the LLM for an agent
   */
  getAgentPrompt(agentId: string): { systemPrompt: string; userPrompt: string } | null {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) return null;

    const context = this.buildAgentContext(agent);
    return {
      systemPrompt: buildSystemPrompt(agent),
      userPrompt: buildContextPrompt(agent, context),
    };
  }

  // ============================================
  // Recording Methods
  // ============================================

  /**
   * Start recording the simulation
   */
  startRecording(name?: string): void {
    this.recording = {
      id: `rec_${Date.now()}`,
      name: name || `Recording ${new Date().toLocaleString()}`,
      startTime: new Date(),
      worldGoal: this.state.worldGoal,
      initialWorld: JSON.parse(JSON.stringify(this.state.world)),
      initialAgents: this.state.agents.map(a => this.snapshotAgent(a)),
      ticks: [],
    };
    this.isRecording = true;
    this.currentTickEvents = [];
    this.currentTickSpeeches = [];
    this.log('system', `Started recording: ${this.recording.name}`);
  }

  /**
   * Stop recording and return the recording
   */
  stopRecording(): Recording | null {
    if (!this.recording) return null;

    this.recording.endTime = new Date();
    this.isRecording = false;
    const finalRecording = this.recording;
    this.log('system', `Stopped recording: ${finalRecording.name} (${finalRecording.ticks.length} ticks)`);
    this.onRecordingUpdateCallback?.(finalRecording);
    return finalRecording;
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current recording (may be incomplete)
   */
  getCurrentRecording(): Recording | null {
    return this.recording;
  }

  /**
   * Set callback for recording updates
   */
  onRecordingUpdate(callback: (recording: Recording) => void): void {
    this.onRecordingUpdateCallback = callback;
  }

  /**
   * Snapshot an agent's state for recording
   */
  private snapshotAgent(agent: Agent): RecordedAgentState {
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      position: { ...agent.position },
      state: agent.state,
      health: agent.health,
      hunger: agent.hunger,
      inventory: JSON.parse(JSON.stringify(agent.inventory)),
      lastThought: agent.lastThought,
      currentAction: agent.currentAction ? JSON.parse(JSON.stringify(agent.currentAction)) : null,
      assignedGoal: agent.assignedGoal,
    };
  }

  /**
   * Record the current tick state
   */
  private recordTick(): void {
    if (!this.recording || !this.isRecording) return;

    const recordedTick: RecordedTick = {
      tick: this.state.world.tick,
      timestamp: new Date(),
      agents: this.state.agents.map(a => this.snapshotAgent(a)),
      speeches: [...this.currentTickSpeeches],
      events: [...this.currentTickEvents],
    };

    this.recording.ticks.push(recordedTick);

    // Clear tick events for next tick
    this.currentTickEvents = [];
    this.currentTickSpeeches = [];

    // Notify of recording update
    this.onRecordingUpdateCallback?.(this.recording);
  }

  /**
   * Record an event (called from action execution)
   */
  recordEvent(event: RecordedEvent): void {
    if (!this.isRecording) return;
    this.currentTickEvents.push(event);
  }

  /**
   * Record a speech (called from action execution)
   */
  recordSpeech(speech: RecordedSpeech): void {
    if (!this.isRecording) return;
    this.currentTickSpeeches.push(speech);
  }

  /**
   * Record an action as an event
   */
  private recordActionEvent(agent: Agent, action: import('@/types').Action): void {
    if (!this.isRecording) return;

    let eventType: RecordedEvent['type'] = 'other';
    let description = '';
    const data: Record<string, unknown> = { action };

    switch (action.type) {
      case ActionType.MOVE:
        eventType = 'move';
        description = `Moved ${action.direction}`;
        // Clear travel destination when manually moving
        agent.travelDestination = null;
        break;
      case ActionType.MOVE_TOWARDS: {
        eventType = 'move';
        const moveTowardsAction = action as MoveTowardsAction;
        description = `Moving towards (${moveTowardsAction.x},${moveTowardsAction.y})`;
        // Clear travel destination when using move_towards
        agent.travelDestination = null;
        break;
      }
      case ActionType.TRAVEL_TO: {
        eventType = 'move';
        const travelToAction = action as TravelToAction;
        description = `Started traveling to (${travelToAction.x},${travelToAction.y})`;
        break;
      }
      case ActionType.GATHER:
        eventType = 'gather';
        description = `Gathered from ${action.direction}`;
        break;
      case ActionType.SPEAK: {
        eventType = 'speak';
        const speakAction = action as SpeakAction;
        const target = speakAction.targetAgentId
          ? this.state.agents.find(a => a.id === speakAction.targetAgentId)?.name
          : null;
        description = target
          ? `Said to ${target}: "${speakAction.message}"`
          : `Announced: "${speakAction.message}"`;

        // Also record as speech for playback
        this.currentTickSpeeches.push({
          agentId: agent.id,
          agentName: agent.name,
          message: speakAction.message,
          targetAgentId: speakAction.targetAgentId,
          isBroadcast: !speakAction.targetAgentId,
        });
        break;
      }
      case ActionType.BUILD:
        eventType = 'build';
        description = `Built ${action.structureType} to the ${action.direction}`;
        break;
      case ActionType.PLANT:
        eventType = 'plant';
        description = `Planted seeds to the ${action.direction}`;
        break;
      case ActionType.OFFER_TRADE:
      case ActionType.ACCEPT_TRADE:
      case ActionType.REJECT_TRADE:
        eventType = 'trade';
        description = `Trade action: ${action.type}`;
        break;
      case ActionType.WAIT:
        eventType = 'wait';
        description = `Waiting: ${action.reason}`;
        break;
      case ActionType.EAT:
        eventType = 'eat';
        description = `Ate food`;
        break;
      case ActionType.CRAFT: {
        eventType = 'craft';
        description = `Crafted: ${(action as import('@/types').CraftAction).recipeId}`;
        break;
      }
      case ActionType.ATTACK: {
        const attackAction = action as AttackAction;
        eventType = 'attack';
        description = `Attacked ${attackAction.direction}`;
        break;
      }
      default:
        description = `Action: ${action.type}`;
    }

    this.currentTickEvents.push({
      type: eventType,
      agentId: agent.id,
      agentName: agent.name,
      description,
      data,
    });
  }
}
