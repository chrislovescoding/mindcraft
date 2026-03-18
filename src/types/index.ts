// ============================================
// Core Type Definitions for Multi-Agent Simulation
// ============================================

// --- Tile & World Types ---

export enum TileType {
  GRASS = 'grass',
  WATER = 'water',
  STONE = 'stone',
  TREE = 'tree',
  FARMLAND = 'farmland',
  SAND = 'sand',
  BRIDGE = 'bridge',
}

// --- Structure Types ---

export enum StructureType {
  SHELTER = 'shelter',     // Basic protection
  STORAGE = 'storage',     // Store extra resources
  FENCE = 'fence',         // Barrier/boundary
  WORKSHOP = 'workshop',   // Crafting station
  WELL = 'well',           // Water source
}

export interface Structure {
  type: StructureType;
  health: number;          // 0-100
  builtBy: string;         // Agent ID who built it
  builtAt: number;         // Tick when built
}

// Structure building costs
export const STRUCTURE_COSTS: Record<StructureType, { wood?: number; stone?: number }> = {
  [StructureType.SHELTER]: { wood: 5 },
  [StructureType.STORAGE]: { wood: 3 },
  [StructureType.FENCE]: { wood: 1 },
  [StructureType.WORKSHOP]: { wood: 4, stone: 2 },
  [StructureType.WELL]: { stone: 5 },
};

// --- Crop Types ---

export enum CropState {
  SEED = 'seed',
  GROWING = 'growing',
  MATURE = 'mature',
}

export interface Crop {
  state: CropState;
  plantedAt: number;       // Tick when planted
  matureAt: number;        // Tick when it becomes mature
  plantedBy: string;       // Agent ID who planted
}

// Crop growth time in ticks
export const CROP_GROWTH_TIME = 10;

export interface Tile {
  type: TileType;
  walkable: boolean;
  resource?: ResourceType;
  resourceAmount?: number;
  structure?: Structure;   // Building on this tile
  crop?: Crop;             // Planted crop (only on farmland)
}

export interface Position {
  x: number;
  y: number;
}

export type TimeOfDay = 'day' | 'dusk' | 'night' | 'dawn';

export interface World {
  width: number;
  height: number;
  tiles: Tile[][];
  tick: number;
  timeOfDay: TimeOfDay;
}

// Day/night cycle constants
export const DAY_CYCLE_LENGTH = 30;

// --- Resource Types ---

export enum ResourceType {
  WOOD = 'wood',
  STONE = 'stone',
  ORE = 'ore',
  CROP = 'crop',
  FOOD = 'food',
  SEED = 'seed',
  TOOL = 'tool',
}

export interface InventoryItem {
  type: ResourceType;
  amount: number;
}

// --- Mob Types ---

export enum MobType {
  WOLF = 'wolf',
  SKELETON = 'skeleton',
}

export interface Mob {
  id: string;
  type: MobType;
  position: Position;
  health: number;
  damage: number;
  dropsFood: number;
}

// --- Crafting Types ---

export interface CraftingRecipe {
  id: string;
  name: string;
  inputs: { type: ResourceType; amount: number }[];
  output: { type: ResourceType; amount: number };
  requiresWorkshop: boolean;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'wooden_tools',
    name: 'Wooden Tools',
    inputs: [{ type: ResourceType.WOOD, amount: 3 }],
    output: { type: ResourceType.TOOL, amount: 1 },
    requiresWorkshop: false,
  },
  {
    id: 'stone_tools',
    name: 'Stone Tools',
    inputs: [
      { type: ResourceType.WOOD, amount: 2 },
      { type: ResourceType.STONE, amount: 2 },
    ],
    output: { type: ResourceType.TOOL, amount: 2 },
    requiresWorkshop: false,
  },
  {
    id: 'bread',
    name: 'Bread',
    inputs: [
      { type: ResourceType.FOOD, amount: 2 },
      { type: ResourceType.SEED, amount: 1 },
    ],
    output: { type: ResourceType.FOOD, amount: 5 },
    requiresWorkshop: true,
  },
];

// --- Agent Types ---

export enum AgentState {
  IDLE = 'idle',
  THINKING = 'thinking',
  ACTING = 'acting',
}

export enum AgentRole {
  FARMER = 'farmer',
  MINER = 'miner',
  GATHERER = 'gatherer',
  TRADER = 'trader',
  LEADER = 'leader',
  BUILDER = 'builder',
}

export interface AgentMessage {
  id: string;
  content: string;
  from: string;
  timestamp: number;
  read: boolean;
}

export interface TradeOffer {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  offering: { type: ResourceType; amount: number };
  requesting: { type: ResourceType; amount: number };
  createdAt: number; // tick when created
  expiresAt: number; // tick when it expires (offers don't last forever)
}

export interface ExploredTile {
  type: TileType;
  hasResource: boolean;
  resourceType?: ResourceType;
  structureType?: StructureType; // Building on this tile
  lastSeen: number; // tick when last seen
}

export interface AgentGoal {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number; // tick when created
  completedAt?: number; // tick when completed
}

export interface AgentGoals {
  personal: AgentGoal[]; // Agent's own goals
}

export interface AgentMemory {
  recentEvents: string[];
  conversations: AgentMessage[];
  knownLocations: { name: string; position: Position }[];
  thoughts: string[]; // History of agent's thoughts/reasoning
  previousPositions: Position[]; // Last N positions for movement tracking
  exploredTiles: Record<string, ExploredTile>; // "x,y" -> tile info
  goals: AgentGoal[]; // Personal goals/todo list
  incomingOffers: TradeOffer[]; // Trade offers from other agents
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  position: Position;
  state: AgentState;
  health: number;            // 0-100, agent dies at 0
  hunger: number;            // 0-100, takes damage at 0
  inventory: InventoryItem[];
  memory: AgentMemory;
  currentAction: Action | null;
  lastThought: string;
  decisionCooldown: number; // ticks until next decision
  assignedGoal: string | null; // Goal assigned by user
  ticksSinceGoalAssigned: number; // Track how long without a goal
  travelDestination: Position | null; // For persistent travel_to action
}

// --- Action Types ---

export enum ActionType {
  MOVE = 'move',
  MOVE_TOWARDS = 'move_towards', // Single step pathfinding toward coordinates
  TRAVEL_TO = 'travel_to', // Persistent pathfinding until arrival
  GATHER = 'gather',
  SPEAK = 'speak',
  OFFER_TRADE = 'offer_trade',
  ACCEPT_TRADE = 'accept_trade',
  REJECT_TRADE = 'reject_trade',
  BUILD = 'build',
  PLANT = 'plant',
  WAIT = 'wait',
  MANAGE_GOAL = 'manage_goal',
  ASSIGN_GOAL = 'assign_goal',
  READ_MESSAGE = 'read_message',
  EAT = 'eat',
  CRAFT = 'craft',
  ATTACK = 'attack',
}

export interface MoveAction {
  type: ActionType.MOVE;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface MoveTowardsAction {
  type: ActionType.MOVE_TOWARDS;
  x: number;
  y: number;
}

export interface TravelToAction {
  type: ActionType.TRAVEL_TO;
  x: number;
  y: number;
}

export interface GatherAction {
  type: ActionType.GATHER;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface SpeakAction {
  type: ActionType.SPEAK;
  targetAgentId?: string;
  message: string;
}

export interface OfferTradeAction {
  type: ActionType.OFFER_TRADE;
  targetAgentId: string;
  offerType: ResourceType;
  offerAmount: number;
  requestType: ResourceType;
  requestAmount: number;
}

export interface AcceptTradeAction {
  type: ActionType.ACCEPT_TRADE;
  offerId: string;
}

export interface RejectTradeAction {
  type: ActionType.REJECT_TRADE;
  offerId: string;
}

export interface BuildAction {
  type: ActionType.BUILD;
  direction: 'north' | 'south' | 'east' | 'west';
  structureType: StructureType;
}

export interface PlantAction {
  type: ActionType.PLANT;
  direction: 'north' | 'south' | 'east' | 'west';
}

export interface WaitAction {
  type: ActionType.WAIT;
  reason: string;
  ticks?: number; // Number of ticks to wait (1-10, default 1)
}

export interface ManageGoalAction {
  type: ActionType.MANAGE_GOAL;
  operation: 'add' | 'complete' | 'update' | 'remove';
  goalId?: string; // Required for complete/update/remove
  description?: string; // Required for add, optional for update
}

export interface AssignGoalAction {
  type: ActionType.ASSIGN_GOAL;
  targetAgentId: string;
  goal: string;
}

export interface ReadMessageAction {
  type: ActionType.READ_MESSAGE;
  messageId: string; // ID of the message to mark as read
}

export interface EatAction {
  type: ActionType.EAT;
}

export interface CraftAction {
  type: ActionType.CRAFT;
  recipeId: string;
}

export interface AttackAction {
  type: ActionType.ATTACK;
  direction: 'north' | 'south' | 'east' | 'west';
}

export type Action = MoveAction | MoveTowardsAction | TravelToAction | GatherAction | SpeakAction | OfferTradeAction | AcceptTradeAction | RejectTradeAction | BuildAction | PlantAction | WaitAction | ManageGoalAction | AssignGoalAction | ReadMessageAction | EatAction | CraftAction | AttackAction;

// --- LLM Types ---

export interface LLMProvider {
  name: string;
  generateDecision(agent: Agent, context: AgentContext): Promise<LLMResponse>;
}

export interface AgentContext {
  worldGoal: string;
  nearbyTiles: { position: Position; tile: Tile }[];
  nearbyAgents: { agent: Agent; distance: number }[];
  nearbyMobs: { mob: Mob; distance: number }[];
  recentMessages: { from: string; message: string; read: boolean }[];
  timeOfDay: TimeOfDay;
  teamGoals?: { agentId: string; agentName: string; agentRole: AgentRole; assignedGoal: string | null; goals: AgentGoal[] }[]; // Only for Leader
}

export interface LLMResponse {
  thought: string;
  actions: Action[]; // Multiple actions allowed per turn
}

// --- Simulation Types ---

export interface SimulationConfig {
  worldWidth: number;
  worldHeight: number;
  tickIntervalMs: number;
  decisionCooldownTicks: number;
  llmProvider: 'claude' | 'openai' | 'ollama';
  llmModel?: string;
}

export interface SimulationState {
  world: World;
  agents: Agent[];
  mobs: Mob[];
  worldGoal: string;
  isRunning: boolean;
  logs: SimulationLog[];
}

export interface SimulationLog {
  tick: number;
  timestamp: Date;
  type: 'world' | 'agent' | 'action' | 'llm' | 'system';
  agentId?: string;
  message: string;
}

// --- Recording Types ---

export interface RecordedAgentState {
  id: string;
  name: string;
  role: AgentRole;
  position: Position;
  state: AgentState;
  health: number;
  hunger: number;
  inventory: InventoryItem[];
  lastThought: string;
  currentAction: Action | null;
  assignedGoal: string | null;
}

export interface RecordedSpeech {
  agentId: string;
  agentName: string;
  message: string;
  targetAgentId?: string;
  isBroadcast: boolean;
}

export interface RecordedEvent {
  type: 'move' | 'gather' | 'speak' | 'build' | 'plant' | 'trade' | 'wait' | 'attack' | 'craft' | 'eat' | 'other';
  agentId: string;
  agentName: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface RecordedTick {
  tick: number;
  timestamp: Date;
  agents: RecordedAgentState[];
  speeches: RecordedSpeech[];
  events: RecordedEvent[];
  worldChanges?: {
    position: Position;
    oldTile: Partial<Tile>;
    newTile: Partial<Tile>;
  }[];
}

export interface Recording {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  worldGoal: string;
  initialWorld: World;
  initialAgents: RecordedAgentState[];
  ticks: RecordedTick[];
}
