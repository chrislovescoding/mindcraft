// ============================================
// A* Pathfinding Algorithm
// ============================================

import { Position, World, Agent } from '@/types';
import { isWalkable } from '@/engine/world';

interface PathNode {
  position: Position;
  g: number; // Cost from start
  h: number; // Heuristic (estimated cost to end)
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

/**
 * Manhattan distance heuristic
 */
function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get position key for map lookups
 */
function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

/**
 * Get neighboring positions (4-directional movement)
 */
function getNeighbors(pos: Position): Position[] {
  return [
    { x: pos.x, y: pos.y + 1 }, // North
    { x: pos.x, y: pos.y - 1 }, // South
    { x: pos.x + 1, y: pos.y }, // East
    { x: pos.x - 1, y: pos.y }, // West
  ];
}

/**
 * Check if a position is valid and walkable
 */
function isValidPosition(
  world: World,
  pos: Position,
  agents: Agent[],
  excludeAgentId?: string
): boolean {
  // Check bounds
  if (pos.x < 0 || pos.x >= world.width || pos.y < 0 || pos.y >= world.height) {
    return false;
  }

  // Check if walkable
  if (!isWalkable(world, pos)) {
    return false;
  }

  // Check if occupied by another agent (except the one pathfinding)
  const occupied = agents.some(
    a => a.id !== excludeAgentId && a.position.x === pos.x && a.position.y === pos.y
  );
  if (occupied) {
    return false;
  }

  return true;
}

/**
 * Find the shortest path using A* algorithm
 * Returns array of positions from start to end (excluding start, including end)
 * Returns null if no path exists
 */
export function findPath(
  world: World,
  start: Position,
  end: Position,
  agents: Agent[],
  excludeAgentId?: string
): Position[] | null {
  // If start equals end, no movement needed
  if (start.x === end.x && start.y === end.y) {
    return [];
  }

  // Check if end position is valid
  if (!isValidPosition(world, end, agents, excludeAgentId)) {
    // Try to find the closest walkable position to the target
    // For now, just return null if exact target isn't reachable
    return null;
  }

  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    position: start,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openSet.set(posKey(start), startNode);

  while (openSet.size > 0) {
    // Find node with lowest f score
    let current: PathNode | null = null;
    let lowestF = Infinity;

    for (const node of openSet.values()) {
      if (node.f < lowestF) {
        lowestF = node.f;
        current = node;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (current.position.x === end.x && current.position.y === end.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: PathNode | null = current;
      while (node && node.parent) {
        path.unshift(node.position);
        node = node.parent;
      }
      return path;
    }

    // Move current from open to closed
    openSet.delete(posKey(current.position));
    closedSet.add(posKey(current.position));

    // Check all neighbors
    for (const neighborPos of getNeighbors(current.position)) {
      const neighborKey = posKey(neighborPos);

      // Skip if already evaluated
      if (closedSet.has(neighborKey)) continue;

      // Skip if not walkable (but allow the end position even if occupied temporarily)
      const isEnd = neighborPos.x === end.x && neighborPos.y === end.y;
      if (!isEnd && !isValidPosition(world, neighborPos, agents, excludeAgentId)) {
        continue;
      }
      // For non-end positions, still check basic walkability
      if (!isEnd) {
        // Already checked in isValidPosition
      } else {
        // For end position, just check bounds and tile walkability, ignore agents
        if (neighborPos.x < 0 || neighborPos.x >= world.width ||
            neighborPos.y < 0 || neighborPos.y >= world.height) {
          continue;
        }
        if (!isWalkable(world, neighborPos)) {
          continue;
        }
      }

      const tentativeG = current.g + 1; // Each step costs 1

      const existingNode = openSet.get(neighborKey);
      if (existingNode) {
        // If this path is better, update it
        if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = tentativeG + existingNode.h;
          existingNode.parent = current;
        }
      } else {
        // Add new node to open set
        const neighborNode: PathNode = {
          position: neighborPos,
          g: tentativeG,
          h: heuristic(neighborPos, end),
          f: tentativeG + heuristic(neighborPos, end),
          parent: current,
        };
        openSet.set(neighborKey, neighborNode);
      }
    }
  }

  // No path found
  return null;
}

/**
 * Get the next step towards a target using A* pathfinding
 * Returns the direction to move, or null if no path exists
 */
export function getNextStepTowards(
  world: World,
  start: Position,
  end: Position,
  agents: Agent[],
  excludeAgentId?: string
): { direction: 'north' | 'south' | 'east' | 'west'; nextPosition: Position } | null {
  const path = findPath(world, start, end, agents, excludeAgentId);

  if (!path || path.length === 0) {
    return null;
  }

  const nextPos = path[0];

  // Determine direction
  let direction: 'north' | 'south' | 'east' | 'west';
  if (nextPos.y > start.y) {
    direction = 'north';
  } else if (nextPos.y < start.y) {
    direction = 'south';
  } else if (nextPos.x > start.x) {
    direction = 'east';
  } else {
    direction = 'west';
  }

  return { direction, nextPosition: nextPos };
}

/**
 * Calculate the path length to a target (for display purposes)
 */
export function getPathLength(
  world: World,
  start: Position,
  end: Position,
  agents: Agent[],
  excludeAgentId?: string
): number | null {
  const path = findPath(world, start, end, agents, excludeAgentId);
  return path ? path.length : null;
}
