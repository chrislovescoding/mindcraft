// ============================================
// Console Logger Utility
// ============================================

import { SimulationLog, Agent, World, SimulationState } from '@/types';

/**
 * Color codes for different log types (for terminal output)
 */
const LOG_COLORS = {
  world: '\x1b[34m',   // Blue
  agent: '\x1b[32m',   // Green
  action: '\x1b[33m',  // Yellow
  llm: '\x1b[35m',     // Magenta
  system: '\x1b[36m',  // Cyan
  reset: '\x1b[0m',
};

/**
 * Format a simulation log for console output
 */
export function formatLog(log: SimulationLog): string {
  const time = log.timestamp.toISOString().split('T')[1].slice(0, 8);
  const tickStr = `T${String(log.tick).padStart(4, '0')}`;
  const typeStr = `[${log.type.toUpperCase().padEnd(6)}]`;
  const agentStr = log.agentId ? ` <${log.agentId.slice(0, 4)}>` : '';

  return `${time} ${tickStr} ${typeStr}${agentStr} ${log.message}`;
}

/**
 * Format log with colors for terminal
 */
export function formatLogColored(log: SimulationLog): string {
  const color = LOG_COLORS[log.type] || LOG_COLORS.reset;
  return `${color}${formatLog(log)}${LOG_COLORS.reset}`;
}

/**
 * Format agent state for display
 */
export function formatAgentState(agent: Agent): string {
  const lines = [
    `┌─ ${agent.name} (${agent.role}) ─────────`,
    `│ Position: (${agent.position.x}, ${agent.position.y})`,
    `│ State: ${agent.state}`,
    `│ Cooldown: ${agent.decisionCooldown}`,
  ];

  if (agent.inventory.length > 0) {
    lines.push(`│ Inventory:`);
    for (const item of agent.inventory) {
      lines.push(`│   - ${item.type}: ${item.amount}`);
    }
  } else {
    lines.push(`│ Inventory: (empty)`);
  }

  if (agent.lastThought) {
    lines.push(`│ Last thought: "${agent.lastThought.slice(0, 50)}..."`);
  }

  lines.push(`└────────────────────────`);

  return lines.join('\n');
}

/**
 * Format simulation state summary
 */
export function formatSimulationState(state: SimulationState): string {
  const lines = [
    `════════════════════════════════════════`,
    `SIMULATION STATE - Tick ${state.world.tick}`,
    `════════════════════════════════════════`,
    `Status: ${state.isRunning ? 'RUNNING' : 'STOPPED'}`,
    `World: ${state.world.width}x${state.world.height}`,
    `Goal: ${state.worldGoal}`,
    `Agents: ${state.agents.length}`,
    ``,
  ];

  for (const agent of state.agents) {
    lines.push(formatAgentState(agent));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create a simple ASCII representation of the world
 */
export function formatWorldASCII(world: World, agents: Agent[]): string {
  const lines: string[] = [];

  // Top border
  lines.push('┌' + '─'.repeat(world.width * 2) + '┐');

  for (let y = 0; y < world.height; y++) {
    let row = '│';
    for (let x = 0; x < world.width; x++) {
      // Check if agent is here
      const agent = agents.find((a) => a.position.x === x && a.position.y === y);
      if (agent) {
        row += agent.name[0] + ' ';
        continue;
      }

      const tile = world.tiles[y][x];
      switch (tile.type) {
        case 'grass': row += '. '; break;
        case 'water': row += '~ '; break;
        case 'stone': row += '# '; break;
        case 'tree': row += 'T '; break;
        case 'farmland': row += 'F '; break;
        case 'sand': row += '. '; break;
        default: row += '? ';
      }
    }
    row += '│';
    lines.push(row);
  }

  // Bottom border
  lines.push('└' + '─'.repeat(world.width * 2) + '┘');

  // Legend
  lines.push('Legend: . = grass, ~ = water, # = stone, T = tree, F = farmland');
  lines.push('Agents shown by first letter of name');

  return lines.join('\n');
}

/**
 * Logger class for managing simulation output
 */
export class SimulationLogger {
  private logs: SimulationLog[] = [];
  private maxLogs: number;

  constructor(maxLogs: number = 100) {
    this.maxLogs = maxLogs;
  }

  add(log: SimulationLog): void {
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    // Also output to console
    console.log(formatLogColored(log));
  }

  getLogs(): SimulationLog[] {
    return [...this.logs];
  }

  getRecentLogs(count: number = 20): SimulationLog[] {
    return this.logs.slice(-count);
  }

  clear(): void {
    this.logs = [];
  }

  getFormattedLogs(): string {
    return this.logs.map(formatLog).join('\n');
  }
}
