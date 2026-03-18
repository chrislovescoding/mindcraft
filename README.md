# MAS - Multi-Agent Simulation

An interactive AI-driven multi-agent simulation where LLM-powered agents cooperate in a procedurally-generated 2D world to gather resources, farm, build structures, trade, and survive. Agents use language models (Claude, OpenAI, or Ollama) to make intelligent decisions in real-time.

## Features

- **AI-Powered Agents** - Three agents (Gatherer, Farmer, Leader) with distinct roles make autonomous decisions via LLM calls
- **Procedural World** - 20x20 grid with grass, water, stone, trees, farmland, sand, and bridges
- **Resource Gathering & Crafting** - Collect wood, stone, ore, food, and seeds; craft tools
- **Farming System** - Plant seeds, grow crops over a 10-tick cycle, harvest for food and seeds
- **Building** - Construct shelters, storage, fences, workshops, and wells from gathered resources
- **Day/Night Cycle** - 30-tick cycle with dawn, day, dusk, and night phases affecting visibility and mob spawns
- **Combat** - Hostile mobs (wolves, skeletons) spawn at night; agents fight to survive
- **Trading** - Agents offer, accept, and reject trades with each other
- **Communication** - Broadcast and direct messaging between agents; respond to user messages
- **Recording & Playback** - Record simulations and replay them with speed control and seeking
- **Live Dashboard** - Real-time map, agent stats, inventory, logs, speech bubbles, and controls

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **LLM Providers**: Anthropic Claude, OpenAI, Ollama (local)

## Getting Started

### Prerequisites

- Node.js 18+
- An API key for at least one LLM provider (OpenAI, Anthropic, or a local Ollama instance)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=sk-...               # OpenAI API key
ANTHROPIC_API_KEY=sk-ant-...        # Anthropic Claude API key
OLLAMA_BASE_URL=http://localhost:11434  # Ollama endpoint (optional, this is the default)
```

You only need to configure the provider(s) you plan to use.

### Running

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Simulation Loop

Each tick, the engine:

1. Advances the world clock and updates the time of day
2. Grows crops and updates hunger/health for all agents
3. Spawns and moves hostile mobs (at night)
4. For each agent: builds a context prompt with nearby tiles, agents, mobs, inventory, messages, and goals, then sends it to the configured LLM
5. Validates and executes the returned actions (move, gather, build, trade, speak, etc.)
6. Records tick data if recording is active

### LLM Decision Making

Agents receive a **system prompt** teaching them the game rules (actions, resources, building costs, farming, combat, trading) and a **context prompt** with their current state. The LLM responds with JSON containing a `"thought"` (internal reasoning) and an `"actions"` array. All LLM calls route through `/api/llm` on the server side to keep API keys secure.

### Agent Roles

| Role | Starting Items | Specialty |
|------|---------------|-----------|
| **Gatherer** | 2 food | Resource collection and exploration |
| **Farmer** | 5 seeds, 2 food | Planting, growing, and harvesting crops |
| **Leader (Chief)** | 3 food | Coordinating the team and assigning goals |

### Action Constraints

- Max 1 movement action per turn
- Max 1 physical action (gather, build, plant, attack) per turn
- Movement and physical actions cannot be combined
- Multiple "soft" actions (speak, trade offers) are allowed alongside others
- `travel_to` persists across ticks using A* pathfinding

## Project Structure

```
src/
├── app/
│   ├── page.tsx                # Main UI dashboard and controls
│   ├── layout.tsx              # Root layout
│   └── api/
│       ├── llm/route.ts        # LLM API gateway (Claude/OpenAI/Ollama)
│       └── recordings/route.ts # Recording save/load/delete endpoints
├── engine/
│   ├── simulation.ts           # Main simulation loop and tick processing
│   ├── agent.ts                # Agent state, memory, inventory management
│   ├── world.ts                # World generation, tiles, resources, crops
│   └── actions.ts              # Action validation and execution
├── llm/
│   ├── provider.ts             # Abstract LLM interface and factory
│   ├── claude.ts               # Anthropic Claude provider
│   ├── openai.ts               # OpenAI provider
│   ├── ollama.ts               # Ollama (local) provider
│   └── prompts.ts              # System and context prompt builders
├── types/
│   └── index.ts                # TypeScript type definitions
└── utils/
    ├── pathfinding.ts          # A* pathfinding algorithm
    └── logger.ts               # Log formatting utilities
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/llm` | Send a prompt to the configured LLM provider and get a response |
| GET | `/api/recordings` | List all recordings, or fetch a specific one by `?id=` |
| POST | `/api/recordings` | Save a recording |
| DELETE | `/api/recordings` | Delete a recording by `?id=` |

## License

MIT
