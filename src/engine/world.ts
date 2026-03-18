// ============================================
// World Engine - Tile Map & World State
// ============================================

import { World, Tile, TileType, Position, ResourceType, Structure, StructureType, Crop, CropState, CROP_GROWTH_TIME, STRUCTURE_COSTS, TimeOfDay, DAY_CYCLE_LENGTH } from '@/types';

// Tile walkability mapping
const TILE_WALKABLE: Record<TileType, boolean> = {
  [TileType.GRASS]: true,
  [TileType.WATER]: false,
  [TileType.STONE]: false,
  [TileType.TREE]: false,
  [TileType.FARMLAND]: true,
  [TileType.SAND]: true,
  [TileType.BRIDGE]: true,
};

// Tile resource mapping
// Note: Farmland does NOT have automatic crops - you must plant seeds first
const TILE_RESOURCES: Partial<Record<TileType, ResourceType>> = {
  [TileType.TREE]: ResourceType.WOOD,
  [TileType.STONE]: ResourceType.STONE,
};

/**
 * Create a single tile
 */
export function createTile(type: TileType): Tile {
  return {
    type,
    walkable: TILE_WALKABLE[type],
    resource: TILE_RESOURCES[type],
    resourceAmount: TILE_RESOURCES[type] ? 10 : undefined,
  };
}

/**
 * Generate a natural-feeling world with structured terrain
 */
export function generateWorld(width: number, height: number): World {
  // Initialize with grass
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      row.push(createTile(TileType.GRASS));
    }
    tiles.push(row);
  }

  // Helper to set tile safely
  const setTile = (x: number, y: number, type: TileType) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      tiles[y][x] = createTile(type);
    }
  };

  const getTileType = (x: number, y: number): TileType | null => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      return tiles[y][x].type;
    }
    return null;
  };

  // 1. Generate a river (flows from top to bottom with some meandering)
  // Track river positions for bridge placement
  const riverPositions: { x: number; width: number; y: number }[] = [];
  let riverX = Math.floor(width * 0.3) + Math.floor(Math.random() * (width * 0.4));
  for (let y = 0; y < height; y++) {
    // River is 2-3 tiles wide
    const riverWidth = 2 + (y % 5 === 0 ? 1 : 0);
    riverPositions.push({ x: riverX, width: riverWidth, y });
    for (let dx = 0; dx < riverWidth; dx++) {
      setTile(riverX + dx, y, TileType.WATER);
    }
    // Meander left or right occasionally
    if (Math.random() < 0.3) {
      riverX += Math.random() < 0.5 ? -1 : 1;
      riverX = Math.max(2, Math.min(width - 4, riverX));
    }
  }

  // 1b. Add a bridge across the river (pick a spot roughly in the middle)
  const bridgeY = Math.floor(height * 0.3) + Math.floor(Math.random() * (height * 0.4));
  const riverAtBridge = riverPositions[bridgeY];
  if (riverAtBridge) {
    // Place bridge tiles across the river
    for (let dx = -1; dx <= riverAtBridge.width; dx++) {
      const bx = riverAtBridge.x + dx;
      if (bx >= 0 && bx < width) {
        setTile(bx, bridgeY, TileType.BRIDGE);
      }
    }
    // Make sure there's grass on both sides of the bridge for access
    if (riverAtBridge.x - 2 >= 0 && getTileType(riverAtBridge.x - 2, bridgeY) !== TileType.WATER) {
      setTile(riverAtBridge.x - 2, bridgeY, TileType.GRASS);
    }
    const rightSide = riverAtBridge.x + riverAtBridge.width + 1;
    if (rightSide < width && getTileType(rightSide, bridgeY) !== TileType.WATER) {
      setTile(rightSide, bridgeY, TileType.GRASS);
    }
  }

  // 2. Add a small lake (connected to river or separate)
  const lakeX = Math.floor(Math.random() * (width - 6)) + 3;
  const lakeY = Math.floor(Math.random() * (height - 6)) + 3;
  const lakeRadius = 2 + Math.floor(Math.random() * 2);
  for (let dy = -lakeRadius; dy <= lakeRadius; dy++) {
    for (let dx = -lakeRadius; dx <= lakeRadius; dx++) {
      // Circular-ish lake
      if (dx * dx + dy * dy <= lakeRadius * lakeRadius + Math.random() * 2) {
        setTile(lakeX + dx, lakeY + dy, TileType.WATER);
      }
    }
  }

  // 3. Generate forest clusters (2-4 forests)
  const numForests = 2 + Math.floor(Math.random() * 3);
  for (let f = 0; f < numForests; f++) {
    const forestX = Math.floor(Math.random() * (width - 4)) + 2;
    const forestY = Math.floor(Math.random() * (height - 4)) + 2;
    const forestSize = 3 + Math.floor(Math.random() * 4);

    for (let dy = -forestSize; dy <= forestSize; dy++) {
      for (let dx = -forestSize; dx <= forestSize; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        // Denser in center, sparser at edges
        if (dist <= forestSize && Math.random() < (1 - dist / (forestSize + 2))) {
          const tx = forestX + dx;
          const ty = forestY + dy;
          // Don't overwrite water
          if (getTileType(tx, ty) === TileType.GRASS) {
            setTile(tx, ty, TileType.TREE);
          }
        }
      }
    }
  }

  // 4. Generate stone/mountain formations (1-2 formations, usually at edges or corners)
  const numStoneFormations = 1 + Math.floor(Math.random() * 2);
  for (let s = 0; s < numStoneFormations; s++) {
    // Prefer edges/corners for mountains
    const corner = Math.floor(Math.random() * 4);
    let stoneX: number, stoneY: number;
    switch (corner) {
      case 0: stoneX = 2 + Math.floor(Math.random() * 4); stoneY = 2 + Math.floor(Math.random() * 4); break;
      case 1: stoneX = width - 4 - Math.floor(Math.random() * 4); stoneY = 2 + Math.floor(Math.random() * 4); break;
      case 2: stoneX = 2 + Math.floor(Math.random() * 4); stoneY = height - 4 - Math.floor(Math.random() * 4); break;
      default: stoneX = width - 4 - Math.floor(Math.random() * 4); stoneY = height - 4 - Math.floor(Math.random() * 4); break;
    }

    const stoneSize = 2 + Math.floor(Math.random() * 3);
    for (let dy = -stoneSize; dy <= stoneSize; dy++) {
      for (let dx = -stoneSize; dx <= stoneSize; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist <= stoneSize && Math.random() < 0.7) {
          const tx = stoneX + dx;
          const ty = stoneY + dy;
          if (getTileType(tx, ty) === TileType.GRASS) {
            setTile(tx, ty, TileType.STONE);
          }
        }
      }
    }
  }

  // 5. Add farmland patches near water
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (getTileType(x, y) !== TileType.GRASS) continue;

      // Check if adjacent to water
      const nearWater = [
        getTileType(x - 1, y),
        getTileType(x + 1, y),
        getTileType(x, y - 1),
        getTileType(x, y + 1),
      ].includes(TileType.WATER);

      if (nearWater && Math.random() < 0.4) {
        setTile(x, y, TileType.FARMLAND);
      }
    }
  }

  // 6. Add scattered trees in grassland (sparse, natural)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getTileType(x, y) === TileType.GRASS && Math.random() < 0.03) {
        setTile(x, y, TileType.TREE);
      }
    }
  }

  // 7. Find spawn area - look for a cluster of grass tiles (don't clear anything)
  // The simulation will find valid grass positions for agents

  return {
    width,
    height,
    tiles,
    tick: 0,
    timeOfDay: 'day' as TimeOfDay,
  };
}

/**
 * Get time of day based on current tick
 */
export function getTimeOfDay(tick: number): TimeOfDay {
  const phase = tick % DAY_CYCLE_LENGTH;
  if (phase < 15) return 'day';
  if (phase < 18) return 'dusk';
  if (phase < 27) return 'night';
  return 'dawn';
}

/**
 * Check if it's nighttime
 */
export function isNighttime(timeOfDay: TimeOfDay): boolean {
  return timeOfDay === 'night' || timeOfDay === 'dusk';
}

/**
 * Count walkable neighbors for a position
 */
function countWalkableNeighbors(world: World, pos: Position): number {
  const directions = [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 },
  ];

  let count = 0;
  for (const dir of directions) {
    if (isInBounds(world, dir) && world.tiles[dir.y][dir.x].walkable) {
      count++;
    }
  }
  return count;
}

/**
 * Find all contiguous walkable regions using flood-fill
 */
function findWalkableRegions(world: World): Position[][] {
  const visited = new Set<string>();
  const regions: Position[][] = [];

  const getKey = (x: number, y: number) => `${x},${y}`;

  // Flood-fill from a starting position
  const floodFill = (startX: number, startY: number): Position[] => {
    const region: Position[] = [];
    const queue: Position[] = [{ x: startX, y: startY }];
    visited.add(getKey(startX, startY));

    while (queue.length > 0) {
      const pos = queue.shift()!;
      region.push(pos);

      // Check all 4 directions
      const neighbors = [
        { x: pos.x - 1, y: pos.y },
        { x: pos.x + 1, y: pos.y },
        { x: pos.x, y: pos.y - 1 },
        { x: pos.x, y: pos.y + 1 },
      ];

      for (const neighbor of neighbors) {
        const key = getKey(neighbor.x, neighbor.y);
        if (visited.has(key)) continue;
        if (!isInBounds(world, neighbor)) continue;

        const tile = world.tiles[neighbor.y][neighbor.x];
        // Consider walkable tiles (grass, farmland, sand)
        if (tile.walkable) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    return region;
  };

  // Find all regions
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const key = getKey(x, y);
      if (visited.has(key)) continue;

      const tile = world.tiles[y][x];
      if (tile.walkable) {
        const region = floodFill(x, y);
        if (region.length > 0) {
          regions.push(region);
        }
      }
    }
  }

  return regions;
}

/**
 * Find valid spawn positions in the largest walkable area
 * Ensures agents spawn in open areas where they can move freely
 */
export function findSpawnPositions(world: World, count: number): Position[] {
  // Find all contiguous walkable regions
  const regions = findWalkableRegions(world);

  if (regions.length === 0) {
    console.warn('No walkable regions found!');
    return [];
  }

  // Find the largest region
  const largestRegion = regions.reduce((largest, current) =>
    current.length > largest.length ? current : largest
  );

  console.log(`Found ${regions.length} walkable regions. Largest has ${largestRegion.length} tiles.`);

  // Score each tile by "openness" (number of walkable neighbors)
  // Only consider tiles with 3+ walkable neighbors (open areas, not corridors)
  const openTiles = largestRegion
    .map(pos => ({
      pos,
      neighbors: countWalkableNeighbors(world, pos),
      isGrass: world.tiles[pos.y][pos.x].type === TileType.GRASS,
    }))
    .filter(t => t.neighbors >= 3) // Must have at least 3 walkable neighbors
    .sort((a, b) => {
      // Prefer grass, then by openness
      if (a.isGrass !== b.isGrass) return b.isGrass ? 1 : -1;
      return b.neighbors - a.neighbors;
    });

  // If no open tiles found, fall back to tiles with 2+ neighbors
  const candidates = openTiles.length >= count
    ? openTiles
    : largestRegion
        .map(pos => ({
          pos,
          neighbors: countWalkableNeighbors(world, pos),
          isGrass: world.tiles[pos.y][pos.x].type === TileType.GRASS,
        }))
        .filter(t => t.neighbors >= 2)
        .sort((a, b) => b.neighbors - a.neighbors);

  if (candidates.length === 0) {
    console.warn('No suitable spawn positions found!');
    return largestRegion.slice(0, count); // Last resort
  }

  // Find centroid of candidates
  const centroidX = candidates.reduce((sum, t) => sum + t.pos.x, 0) / candidates.length;
  const centroidY = candidates.reduce((sum, t) => sum + t.pos.y, 0) / candidates.length;

  // Sort by distance from centroid, keeping openness as tiebreaker
  candidates.sort((a, b) => {
    const distA = Math.abs(a.pos.x - centroidX) + Math.abs(a.pos.y - centroidY);
    const distB = Math.abs(b.pos.x - centroidX) + Math.abs(b.pos.y - centroidY);
    if (Math.abs(distA - distB) < 3) {
      // Similar distance - prefer more open
      return b.neighbors - a.neighbors;
    }
    return distA - distB;
  });

  // Pick spawn positions ensuring they don't overlap
  const spawnPositions: Position[] = [];
  const usedKeys = new Set<string>();

  for (const candidate of candidates) {
    if (spawnPositions.length >= count) break;

    const key = `${candidate.pos.x},${candidate.pos.y}`;
    if (usedKeys.has(key)) continue;

    // For first position, just use it
    // For subsequent positions, prefer ones close to existing spawns
    if (spawnPositions.length === 0) {
      spawnPositions.push(candidate.pos);
      usedKeys.add(key);
    } else {
      const isNearby = spawnPositions.some(sp =>
        Math.abs(sp.x - candidate.pos.x) <= 4 && Math.abs(sp.y - candidate.pos.y) <= 4
      );
      if (isNearby) {
        spawnPositions.push(candidate.pos);
        usedKeys.add(key);
      }
    }
  }

  // If we couldn't find enough nearby positions, expand search
  if (spawnPositions.length < count) {
    for (const candidate of candidates) {
      if (spawnPositions.length >= count) break;
      const key = `${candidate.pos.x},${candidate.pos.y}`;
      if (!usedKeys.has(key)) {
        spawnPositions.push(candidate.pos);
        usedKeys.add(key);
      }
    }
  }

  console.log(`Spawning ${spawnPositions.length} agents at positions:`, spawnPositions);
  return spawnPositions;
}

/**
 * Check if a position is within world bounds
 */
export function isInBounds(world: World, pos: Position): boolean {
  return pos.x >= 0 && pos.x < world.width && pos.y >= 0 && pos.y < world.height;
}

/**
 * Check if a position is walkable
 */
export function isWalkable(world: World, pos: Position): boolean {
  if (!isInBounds(world, pos)) return false;
  return world.tiles[pos.y][pos.x].walkable;
}

/**
 * Get tile at position
 */
export function getTile(world: World, pos: Position): Tile | null {
  if (!isInBounds(world, pos)) return null;
  return world.tiles[pos.y][pos.x];
}

/**
 * Get nearby tiles within a radius
 */
export function getNearbyTiles(
  world: World,
  center: Position,
  radius: number
): { position: Position; tile: Tile }[] {
  const nearby: { position: Position; tile: Tile }[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const pos = { x: center.x + dx, y: center.y + dy };
      const tile = getTile(world, pos);
      if (tile) {
        nearby.push({ position: pos, tile });
      }
    }
  }

  return nearby;
}

/**
 * Calculate Manhattan distance between two positions
 */
export function getDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Get position after moving in a direction
 */
export function getPositionInDirection(
  pos: Position,
  direction: 'north' | 'south' | 'east' | 'west'
): Position {
  switch (direction) {
    case 'north':
      return { x: pos.x, y: pos.y + 1 }; // Y increases going north
    case 'south':
      return { x: pos.x, y: pos.y - 1 }; // Y decreases going south
    case 'east':
      return { x: pos.x + 1, y: pos.y };
    case 'west':
      return { x: pos.x - 1, y: pos.y };
  }
}

export interface HarvestResult {
  harvested: number;
  depleted: boolean;
  resourceType?: ResourceType;
}

/**
 * Harvest resource from a tile
 */
export function harvestResource(world: World, pos: Position, amount: number = 1): HarvestResult {
  const tile = getTile(world, pos);
  if (!tile || !tile.resource || !tile.resourceAmount) return { harvested: 0, depleted: false };

  const resourceType = tile.resource;
  const harvested = Math.min(amount, tile.resourceAmount);
  tile.resourceAmount -= harvested;

  // Check if depleted - turn to grass
  const depleted = tile.resourceAmount === 0;
  if (depleted) {
    tile.type = TileType.GRASS;
    tile.walkable = true;
    tile.resource = undefined;
    tile.resourceAmount = undefined;
  }

  return { harvested, depleted, resourceType };
}

/**
 * Get world state summary for logging
 */
export function getWorldSummary(world: World): string {
  const tileCounts: Record<TileType, number> = {
    [TileType.GRASS]: 0,
    [TileType.WATER]: 0,
    [TileType.STONE]: 0,
    [TileType.TREE]: 0,
    [TileType.FARMLAND]: 0,
    [TileType.SAND]: 0,
    [TileType.BRIDGE]: 0,
  };

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      tileCounts[world.tiles[y][x].type]++;
    }
  }

  return `World ${world.width}x${world.height} | ` +
    Object.entries(tileCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
}

// ============================================
// Building System
// ============================================

export interface BuildResult {
  success: boolean;
  structure?: Structure;
  error?: string;
}

/**
 * Check if a structure can be built at a position
 */
export function canBuildAt(world: World, pos: Position): { canBuild: boolean; reason?: string } {
  if (!isInBounds(world, pos)) {
    return { canBuild: false, reason: 'Position is out of bounds' };
  }

  const tile = getTile(world, pos);
  if (!tile) {
    return { canBuild: false, reason: 'No tile at position' };
  }

  if (tile.type === TileType.WATER) {
    return { canBuild: false, reason: 'Cannot build on water' };
  }

  if (tile.structure) {
    return { canBuild: false, reason: `A ${tile.structure.type} already exists here` };
  }

  // Can't build on resource tiles (trees, stone)
  if (tile.type === TileType.TREE || tile.type === TileType.STONE) {
    return { canBuild: false, reason: `Cannot build on ${tile.type} - harvest it first` };
  }

  return { canBuild: true };
}

/**
 * Build a structure at a position
 */
export function buildStructure(
  world: World,
  pos: Position,
  structureType: StructureType,
  agentId: string
): BuildResult {
  const checkResult = canBuildAt(world, pos);
  if (!checkResult.canBuild) {
    return { success: false, error: checkResult.reason };
  }

  const tile = getTile(world, pos)!;

  const structure: Structure = {
    type: structureType,
    health: 100,
    builtBy: agentId,
    builtAt: world.tick,
  };

  tile.structure = structure;

  // Structures make tiles non-walkable (except fence which is low)
  if (structureType !== StructureType.FENCE) {
    tile.walkable = false;
  }

  return { success: true, structure };
}

// ============================================
// Planting & Crop System
// ============================================

export interface PlantResult {
  success: boolean;
  crop?: Crop;
  error?: string;
}

/**
 * Check if crops can be planted at a position
 */
export function canPlantAt(world: World, pos: Position): { canPlant: boolean; reason?: string } {
  if (!isInBounds(world, pos)) {
    return { canPlant: false, reason: 'Position is out of bounds' };
  }

  const tile = getTile(world, pos);
  if (!tile) {
    return { canPlant: false, reason: 'No tile at position' };
  }

  if (tile.type !== TileType.FARMLAND) {
    return { canPlant: false, reason: `Can only plant on farmland, not ${tile.type}` };
  }

  if (tile.crop) {
    return { canPlant: false, reason: `Crop already planted here (${tile.crop.state})` };
  }

  if (tile.structure) {
    return { canPlant: false, reason: `Cannot plant where a ${tile.structure.type} exists` };
  }

  return { canPlant: true };
}

/**
 * Plant a crop at a position
 */
export function plantCrop(
  world: World,
  pos: Position,
  agentId: string
): PlantResult {
  const checkResult = canPlantAt(world, pos);
  if (!checkResult.canPlant) {
    return { success: false, error: checkResult.reason };
  }

  const tile = getTile(world, pos)!;

  const crop: Crop = {
    state: CropState.SEED,
    plantedAt: world.tick,
    matureAt: world.tick + CROP_GROWTH_TIME,
    plantedBy: agentId,
  };

  tile.crop = crop;
  // Set the farmland as having a crop resource
  tile.resource = ResourceType.CROP;
  tile.resourceAmount = 0; // Will become harvestable when mature

  return { success: true, crop };
}

/**
 * Process crop growth for the entire world
 * Called each tick
 */
export function processCropGrowth(world: World): { grownCrops: Position[]; maturedCrops: Position[] } {
  const grownCrops: Position[] = [];
  const maturedCrops: Position[] = [];

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.tiles[y][x];
      if (!tile.crop) continue;

      const crop = tile.crop;
      const ticksSincePlanted = world.tick - crop.plantedAt;
      const growthProgress = ticksSincePlanted / CROP_GROWTH_TIME;

      if (crop.state === CropState.SEED && growthProgress >= 0.5) {
        // Halfway - transition to growing
        crop.state = CropState.GROWING;
        grownCrops.push({ x, y });
      } else if (crop.state === CropState.GROWING && world.tick >= crop.matureAt) {
        // Fully mature - ready to harvest
        crop.state = CropState.MATURE;
        tile.resourceAmount = 3; // Mature crops yield 3 food when harvested
        maturedCrops.push({ x, y });
      }
    }
  }

  return { grownCrops, maturedCrops };
}

export interface CropHarvestResult {
  food: number;
  seeds: number;
  success: boolean;
}

/**
 * Harvest a mature crop - returns food and seeds
 */
export function harvestCrop(world: World, pos: Position): CropHarvestResult {
  const tile = getTile(world, pos);
  if (!tile || !tile.crop) {
    return { food: 0, seeds: 0, success: false };
  }

  if (tile.crop.state !== CropState.MATURE) {
    return { food: 0, seeds: 0, success: false };
  }

  const food = tile.resourceAmount || 3;
  const seeds = 1 + Math.floor(Math.random() * 2); // 1-2 seeds per harvest

  // Clear the crop - farmland is now empty and ready for replanting
  tile.crop = undefined;
  tile.resource = undefined;
  tile.resourceAmount = undefined;

  return { food, seeds, success: true };
}
