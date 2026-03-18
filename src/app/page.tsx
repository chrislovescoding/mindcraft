'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Simulation } from '@/engine/simulation';
import { SimulationState, SimulationLog, World, Agent, TileType, AgentContext, CropState, StructureType, Recording, RecordedAgentState, RecordedSpeech, Mob } from '@/types';
import { formatLog } from '@/utils/logger';

// Playback Map Component for recordings
function PlaybackMap({ world, agents, speeches }: {
  world: World;
  agents: RecordedAgentState[];
  speeches: RecordedSpeech[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(20);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const w = parent.clientWidth - 16;
      const h = parent.clientHeight - 16;
      const size = Math.floor(Math.min(w / world.width, h / world.height));
      setCellPx(Math.max(size, 8));
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (containerRef.current?.parentElement) obs.observe(containerRef.current.parentElement);
    return () => obs.disconnect();
  }, [world.width, world.height]);

  const getTileBg = (type: TileType): string => {
    switch (type) {
      case TileType.GRASS: return 'bg-green-700';
      case TileType.WATER: return 'bg-blue-500';
      case TileType.STONE: return 'bg-gray-500';
      case TileType.TREE: return 'bg-green-500';
      case TileType.FARMLAND: return 'bg-yellow-700';
      case TileType.SAND: return 'bg-yellow-300';
      case TileType.BRIDGE: return 'bg-amber-600';
      default: return 'bg-gray-700';
    }
  };

  const getAgentStyle = (agent: RecordedAgentState): string => {
    const base = 'font-bold flex items-center justify-center';
    if (agent.state === 'thinking') return `${base} bg-yellow-400 text-black animate-pulse`;
    if (agent.state === 'acting') return `${base} bg-green-400 text-black`;
    return `${base} bg-red-500 text-white`;
  };

  const cellSize = `${cellPx}px`;

  // Build speech map (agent id -> message)
  const speechMap = new Map<string, string>();
  for (const speech of speeches) {
    speechMap.set(speech.agentId, speech.message);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `repeat(${world.width}, ${cellSize})`,
          gridTemplateRows: `repeat(${world.height}, ${cellSize})`,
        }}
      >
        {Array.from({ length: world.height }, (_, rowIdx) => {
          const y = world.height - 1 - rowIdx; // Flip Y so north (higher Y) is at top
          return Array.from({ length: world.width }, (_, x) => {
            const agent = agents.find(a => a.position.x === x && a.position.y === y);
            const tile = world.tiles[y][x];

            if (agent) {
              const message = speechMap.get(agent.id);
              return (
                <div
                  key={`${x}-${y}`}
                  className={`${getAgentStyle(agent)} relative`}
                  style={{ fontSize: `calc(${cellSize} * 0.7)` }}
                  title={`${agent.name} (${agent.role})`}
                >
                  {agent.name[0]}
                  {message && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 z-10 pointer-events-none">
                      <div className="bg-white text-black text-[9px] px-1.5 py-0.5 rounded shadow-lg max-w-32 text-center leading-tight line-clamp-2 overflow-hidden">
                        {message.length > 60 ? message.slice(0, 57) + '...' : message}
                      </div>
                      <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-transparent border-t-white mx-auto" />
                    </div>
                  )}
                </div>
              );
            }

            const hasStructure = tile.structure;
            const hasCrop = tile.crop;

            const getStructureIcon = (type: StructureType): string => {
              switch (type) {
                case StructureType.SHELTER: return '🏠';
                case StructureType.STORAGE: return '📦';
                case StructureType.FENCE: return '🔲';
                case StructureType.WORKSHOP: return '🔨';
                case StructureType.WELL: return '💧';
                default: return '🏗️';
              }
            };

            const getCropIcon = (state: CropState): string => {
              switch (state) {
                case CropState.SEED: return '·';
                case CropState.GROWING: return '🌱';
                case CropState.MATURE: return '🌾';
                default: return '·';
              }
            };

            return (
              <div
                key={`${x}-${y}`}
                className={`${getTileBg(tile.type)} flex items-center justify-center`}
                style={{ fontSize: `calc(${cellSize} * 0.6)` }}
              >
                {hasStructure && (
                  <span className="drop-shadow-md">{getStructureIcon(tile.structure!.type)}</span>
                )}
                {hasCrop && !hasStructure && (
                  <span className={tile.crop!.state === CropState.MATURE ? 'animate-pulse' : ''}>
                    {getCropIcon(tile.crop!.state)}
                  </span>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

// Map Component with colored squares
function GameMap({ world, agents, mobs, onAgentClick, selectedAgentId, recentMessages }: {
  world: World;
  agents: Agent[];
  mobs: Mob[];
  onAgentClick: (id: string) => void;
  selectedAgentId: string | null;
  recentMessages: { agentId: string; message: string; tick: number }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(20);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      const h = parent.clientHeight;
      const size = Math.floor(h / world.height);
      setCellPx(Math.max(size, 8));
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (containerRef.current?.parentElement) obs.observe(containerRef.current.parentElement);
    return () => obs.disconnect();
  }, [world.width, world.height]);
  const getTileBg = (type: TileType): string => {
    switch (type) {
      case TileType.GRASS: return 'bg-green-700';
      case TileType.WATER: return 'bg-blue-500';
      case TileType.STONE: return 'bg-gray-500';
      case TileType.TREE: return 'bg-green-500';
      case TileType.FARMLAND: return 'bg-yellow-700';
      case TileType.SAND: return 'bg-yellow-300';
      case TileType.BRIDGE: return 'bg-amber-600';
      default: return 'bg-gray-700';
    }
  };

  const getAgentStyle = (agent: Agent): string => {
    const isSelected = agent.id === selectedAgentId;
    const base = 'cursor-pointer font-bold flex items-center justify-center';
    if (agent.state === 'thinking') return `${base} bg-yellow-400 text-black animate-pulse ${isSelected ? 'ring-2 ring-white' : ''}`;
    if (agent.state === 'acting') return `${base} bg-green-400 text-black ${isSelected ? 'ring-2 ring-white' : ''}`;
    return `${base} bg-red-500 text-white ${isSelected ? 'ring-2 ring-white' : ''}`;
  };

  const cellSize = `${cellPx}px`;

  // Get messages for each agent (most recent only)
  const agentMessages = new Map<string, string>();
  for (const msg of recentMessages) {
    if (!agentMessages.has(msg.agentId)) {
      agentMessages.set(msg.agentId, msg.message);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="grid gap-0"
        style={{
          gridTemplateColumns: `repeat(${world.width}, ${cellSize})`,
          gridTemplateRows: `repeat(${world.height}, ${cellSize})`,
        }}
      >
        {Array.from({ length: world.height }, (_, rowIdx) => {
          const y = world.height - 1 - rowIdx; // Flip Y so north (higher Y) is at top
          return Array.from({ length: world.width }, (_, x) => {
            const agent = agents.find(a => a.position.x === x && a.position.y === y);
            const tile = world.tiles[y][x];

            if (agent) {
              const message = agentMessages.get(agent.id);
              return (
                <div
                  key={`${x}-${y}`}
                  className={`${getAgentStyle(agent)} relative`}
                  style={{ fontSize: `calc(${cellSize} * 0.7)` }}
                  title={`${agent.name} (${agent.role}) HP:${agent.health} Hunger:${agent.hunger}`}
                  onClick={() => onAgentClick(agent.id)}
                >
                  {agent.name[0]}
                  {/* Health bar under agent */}
                  {agent.health < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-800">
                      <div className={`h-full ${agent.health > 50 ? 'bg-green-400' : agent.health > 25 ? 'bg-yellow-400' : 'bg-red-500'}`}
                        style={{ width: `${agent.health}%` }} />
                    </div>
                  )}
                  {message && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 z-10 pointer-events-none">
                      <div className="bg-white text-black text-[9px] px-1.5 py-0.5 rounded shadow-lg max-w-32 text-center leading-tight line-clamp-2 overflow-hidden">
                        {message.length > 60 ? message.slice(0, 57) + '...' : message}
                      </div>
                      <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[3px] border-transparent border-t-white mx-auto" />
                    </div>
                  )}
                </div>
              );
            }

            // Check for mob at this position
            const mob = mobs.find(m => m.position.x === x && m.position.y === y);
            if (mob) {
              return (
                <div
                  key={`${x}-${y}`}
                  className={`${getTileBg(tile.type)} flex items-center justify-center relative`}
                  style={{ fontSize: `calc(${cellSize} * 0.7)` }}
                  title={`${mob.type} (HP: ${mob.health})`}
                >
                  <span className="text-red-400 font-bold drop-shadow-md">
                    {mob.type === 'wolf' ? 'W' : 'S'}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-800">
                    <div className="h-full bg-red-500" style={{ width: `${mob.health}%` }} />
                  </div>
                </div>
              );
            }

            // Show structure or crop overlay
            const hasStructure = tile.structure;
            const hasCrop = tile.crop;

            const getStructureIcon = (type: StructureType): string => {
              switch (type) {
                case StructureType.SHELTER: return '🏠';
                case StructureType.STORAGE: return '📦';
                case StructureType.FENCE: return '🔲';
                case StructureType.WORKSHOP: return '🔨';
                case StructureType.WELL: return '💧';
                default: return '🏗️';
              }
            };

            const getCropIcon = (state: CropState): string => {
              switch (state) {
                case CropState.SEED: return '·';
                case CropState.GROWING: return '🌱';
                case CropState.MATURE: return '🌾';
                default: return '·';
              }
            };

            return (
              <div
                key={`${x}-${y}`}
                className={`${getTileBg(tile.type)} hover:brightness-110 flex items-center justify-center relative`}
                style={{ fontSize: `calc(${cellSize} * 0.6)` }}
                title={`${hasStructure ? tile.structure!.type : hasCrop ? `${tile.crop!.state} crop` : tile.type} (${x},${y})`}
              >
                {hasStructure && (
                  <span className="drop-shadow-md">{getStructureIcon(tile.structure!.type)}</span>
                )}
                {hasCrop && !hasStructure && (
                  <span className={tile.crop!.state === CropState.MATURE ? 'animate-pulse' : ''}>
                    {getCropIcon(tile.crop!.state)}
                  </span>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [state, setState] = useState<SimulationState | null>(null);
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [worldGoal, setWorldGoal] = useState('Gather wood and stone. Build a shelter.');
  const [provider, setProvider] = useState<'claude' | 'openai' | 'ollama'>('openai');
  const [model, setModel] = useState('gpt-5');
  const [tickSpeed, setTickSpeed] = useState(2000);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentContext, setSelectedAgentContext] = useState<AgentContext | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [directMessage, setDirectMessage] = useState('');
  const [agentGoalInput, setAgentGoalInput] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [recentMessages, setRecentMessages] = useState<{ agentId: string; message: string; tick: number }[]>([]);

  // Recording and playback state
  const [isRecording, setIsRecording] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<{ id: string; name: string; tickCount: number; startTime: string }[]>([]);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [playbackRecording, setPlaybackRecording] = useState<Recording | null>(null);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showViewOption, setShowViewOption] = useState(false);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const sim = new Simulation({ llmProvider: provider, llmModel: model });
    sim.onLog((log) => {
      setLogs((prev) => [...prev.slice(-199), log]);
      // Track speak actions for speech bubbles
      if (log.type === 'action' && log.message.includes('announced:')) {
        const match = log.message.match(/^(.+?) announced: "(.+)"$/);
        if (match && log.agentId) {
          setRecentMessages((prev) => [
            { agentId: log.agentId!, message: match[2], tick: log.tick },
            ...prev.filter(m => m.agentId !== log.agentId).slice(0, 9)
          ]);
          // Clear message after 5 seconds
          setTimeout(() => {
            setRecentMessages((prev) => prev.filter(m => m.agentId !== log.agentId || m.tick !== log.tick));
          }, 5000);
        }
      }
      if (log.type === 'action' && log.message.includes('said to')) {
        const match = log.message.match(/^(.+?) said to .+?: "(.+)"$/);
        if (match && log.agentId) {
          setRecentMessages((prev) => [
            { agentId: log.agentId!, message: match[2], tick: log.tick },
            ...prev.filter(m => m.agentId !== log.agentId).slice(0, 9)
          ]);
          setTimeout(() => {
            setRecentMessages((prev) => prev.filter(m => m.agentId !== log.agentId || m.tick !== log.tick));
          }, 5000);
        }
      }
    });
    sim.onStateChange((newState) => setState(newState));
    sim.initialize().then(() => {
      setIsInitialized(true);
      setState(sim.getState());
    });
    setSimulation(sim);
    return () => { sim.stop(); };
  }, [provider]);

  // Load saved recordings on mount
  useEffect(() => {
    fetch('/api/recordings')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSavedRecordings(data);
        }
      })
      .catch(err => console.error('Failed to load recordings:', err));
  }, []);

  // Track recording updates
  useEffect(() => {
    if (simulation) {
      simulation.onRecordingUpdate((recording) => {
        setCurrentRecording(recording);
      });
    }
  }, [simulation]);

  const handleStart = () => {
    if (!simulation) return;

    // Auto-start recording if not already recording
    if (!isRecording) {
      simulation.startRecording();
      setIsRecording(true);
    }

    setShowViewOption(false);
    simulation.start();
  };

  const handleStop = () => {
    if (!simulation) return;
    simulation.stop();
    // Show option to view the recording
    if (isRecording && currentRecording && currentRecording.ticks.length > 0) {
      setShowViewOption(true);
    }
  };

  const handleReset = () => {
    if (!simulation) return;

    // Stop and save current recording if exists
    if (isRecording && currentRecording && currentRecording.ticks.length > 0) {
      const finalRecording = simulation.stopRecording();
      if (finalRecording) {
        saveRecording(finalRecording);
      }
    }

    setIsRecording(false);
    setCurrentRecording(null);
    setShowViewOption(false);
    simulation.reset();
    setLogs([]);
  };

  const saveRecording = async (recording: Recording) => {
    try {
      await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recording),
      });
      // Refresh saved recordings list
      const res = await fetch('/api/recordings');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedRecordings(data);
      }
    } catch (err) {
      console.error('Failed to save recording:', err);
    }
  };

  const loadRecording = async (id: string) => {
    try {
      const res = await fetch(`/api/recordings?id=${id}`);
      const recording = await res.json();
      if (recording && recording.ticks) {
        handleStartPlayback(recording);
      }
    } catch (err) {
      console.error('Failed to load recording:', err);
    }
  };

  const deleteRecording = async (id: string) => {
    try {
      await fetch(`/api/recordings?id=${id}`, { method: 'DELETE' });
      setSavedRecordings(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete recording:', err);
    }
  };
  const handleSetGoal = () => simulation?.setWorldGoal(worldGoal);
  const handleTickSpeedChange = (newSpeed: number) => { setTickSpeed(newSpeed); simulation?.setTickSpeed(newSpeed); };
  const handleModelChange = (newModel: string) => { setModel(newModel); simulation?.setModel(newModel); };

  // Model options per provider
  const modelOptions: Record<string, { value: string; label: string }[]> = {
    openai: [
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    ],
    claude: [
      { value: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5' },
      { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    ],
    ollama: [
      { value: 'llama3.2', label: 'Llama 3.2' },
      { value: 'mistral', label: 'Mistral' },
    ],
  };
  const handleSelectAgent = (agentId: string) => setSelectedAgentId(agentId === selectedAgentId ? null : agentId);

  useEffect(() => {
    if (selectedAgentId && simulation) {
      setSelectedAgentContext(simulation.getAgentContext(selectedAgentId));
      const agent = state?.agents.find(a => a.id === selectedAgentId);
      if (agent) {
        setAgentGoalInput(agent.assignedGoal || '');
      }
    } else {
      setSelectedAgentContext(null);
      setAgentGoalInput('');
    }
  }, [selectedAgentId, state, simulation]);

  const handleBroadcast = () => {
    if (broadcastMessage.trim() && simulation) {
      simulation.broadcastMessage(broadcastMessage.trim());
      setBroadcastMessage('');
    }
  };

  const handleDirectMessage = () => {
    if (directMessage.trim() && selectedAgentId && simulation) {
      simulation.sendMessageToAgent(selectedAgentId, directMessage.trim());
      setDirectMessage('');
    }
  };

  const handleSetAgentGoal = () => {
    if (selectedAgentId && simulation) {
      simulation.setAgentGoal(selectedAgentId, agentGoalInput.trim() || null);
    }
  };

  const handleClearAgentGoal = () => {
    if (selectedAgentId && simulation) {
      simulation.setAgentGoal(selectedAgentId, null);
      setAgentGoalInput('');
    }
  };

  // View current recording
  const handleViewCurrentRecording = () => {
    if (currentRecording && currentRecording.ticks.length > 0) {
      handleStartPlayback(currentRecording);
    }
  };

  // Save current recording and refresh list
  const handleSaveCurrentRecording = async () => {
    if (currentRecording && currentRecording.ticks.length > 0) {
      // Stop recording to finalize it
      if (simulation && isRecording) {
        const finalRecording = simulation.stopRecording();
        if (finalRecording) {
          await saveRecording(finalRecording);
          setCurrentRecording(finalRecording);
        }
        setIsRecording(false);
      } else {
        await saveRecording(currentRecording);
      }
      setShowViewOption(false);
    }
  };

  // Playback handlers
  const handleStartPlayback = (recording: Recording) => {
    setPlaybackRecording(recording);
    setPlaybackTick(0);
    setPlaybackMode(true);
    setIsPlaying(false);
    // Stop live simulation
    simulation?.stop();
  };

  const handleExitPlayback = () => {
    setPlaybackMode(false);
    setPlaybackRecording(null);
    setPlaybackTick(0);
    setIsPlaying(false);
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    // Show view option again if we have a current recording
    if (currentRecording && currentRecording.ticks.length > 0 && !state?.isRunning) {
      setShowViewOption(true);
    }
  };

  const handlePlayPause = useCallback(() => {
    if (!playbackRecording) return;

    if (isPlaying) {
      // Pause
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      // Play
      setIsPlaying(true);
    }
  }, [isPlaying, playbackRecording]);

  // Playback timer effect
  useEffect(() => {
    if (isPlaying && playbackRecording) {
      const intervalMs = 1000 / playbackSpeed;
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackTick(prev => {
          const next = prev + 1;
          if (next >= playbackRecording.ticks.length) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, intervalMs);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
      };
    }
  }, [isPlaying, playbackSpeed, playbackRecording]);

  const handleSeek = (tick: number) => {
    setPlaybackTick(Math.max(0, Math.min(tick, (playbackRecording?.ticks.length ?? 1) - 1)));
  };

  // Get current playback data
  const getPlaybackData = () => {
    if (!playbackRecording || playbackTick >= playbackRecording.ticks.length) {
      return null;
    }
    return playbackRecording.ticks[playbackTick];
  };

  const getLogColor = (type: SimulationLog['type']): string => {
    switch (type) {
      case 'world': return 'text-blue-400';
      case 'agent': return 'text-green-400';
      case 'action': return 'text-yellow-400';
      case 'llm': return 'text-purple-400';
      case 'system': return 'text-cyan-400';
      default: return 'text-gray-400';
    }
  };

  const selectedAgent = state?.agents.find(a => a.id === selectedAgentId);

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Top Controls Bar */}
      <div className="bg-gray-800 p-2 flex flex-wrap items-center gap-2 border-b border-gray-700">
        <button onClick={handleStart} disabled={!isInitialized || state?.isRunning}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm">
          Start
        </button>
        <button onClick={handleStop} disabled={!state?.isRunning}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm">
          Stop
        </button>
        <button onClick={handleReset} className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm">Reset</button>

        <div className="h-4 w-px bg-gray-600" />

        <span className="text-xs text-gray-400">Speed:</span>
        <input type="range" min="500" max="10000" step="500" value={tickSpeed}
          onChange={(e) => handleTickSpeedChange(Number(e.target.value))} className="w-20" />
        <span className="text-xs text-gray-400 w-10">{tickSpeed/1000}s</span>

        <div className="h-4 w-px bg-gray-600" />

        <select value={provider} onChange={(e) => {
          const newProvider = e.target.value as 'claude' | 'openai' | 'ollama';
          setProvider(newProvider);
          // Set default model for the new provider
          const defaultModel = modelOptions[newProvider]?.[0]?.value || '';
          setModel(defaultModel);
        }} disabled={state?.isRunning}
          className="bg-gray-700 rounded px-2 py-1 text-xs disabled:opacity-50">
          <option value="claude">Claude</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>

        <select value={model} onChange={(e) => handleModelChange(e.target.value)} disabled={state?.isRunning}
          className="bg-gray-700 rounded px-2 py-1 text-xs disabled:opacity-50">
          {(modelOptions[provider] || []).map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="h-4 w-px bg-gray-600" />

        <span className={`text-xs ${state?.isRunning ? 'text-green-400' : 'text-gray-400'}`}>
          {state?.isRunning ? '● RUNNING' : '○ STOPPED'}
        </span>
        <span className="text-xs text-gray-500">Tick: {state?.world.tick ?? 0}</span>
        {state && (
          <span className={`text-xs ${
            state.world.timeOfDay === 'night' ? 'text-indigo-400' :
            state.world.timeOfDay === 'dusk' ? 'text-orange-400' :
            state.world.timeOfDay === 'dawn' ? 'text-pink-400' :
            'text-yellow-400'
          }`}>
            {state.world.timeOfDay === 'night' ? '🌙' : state.world.timeOfDay === 'dusk' ? '🌅' : state.world.timeOfDay === 'dawn' ? '🌄' : '☀️'} {state.world.timeOfDay}
          </span>
        )}
        {state && state.mobs.length > 0 && (
          <span className="text-xs text-red-400">
            {state.mobs.length} mob{state.mobs.length !== 1 ? 's' : ''}
          </span>
        )}

        <div className="h-4 w-px bg-gray-600" />

        {/* Recording Status */}
        {isRecording && (
          <span className="px-2 py-1 bg-red-600 rounded text-xs flex items-center gap-1 animate-pulse">
            <span className="w-2 h-2 bg-white rounded-full"></span>
            REC {currentRecording?.ticks.length || 0} ticks
          </span>
        )}

        {/* View Recording Option (shown after stop) */}
        {showViewOption && currentRecording && currentRecording.ticks.length > 0 && (
          <>
            <button onClick={handleViewCurrentRecording}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm">
              View Recording
            </button>
            <button onClick={handleSaveCurrentRecording}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm">
              Save Recording
            </button>
          </>
        )}

        {/* Load Saved Recordings */}
        {savedRecordings.length > 0 && !playbackMode && (
          <select
            onChange={(e) => {
              const id = e.target.value;
              if (id) loadRecording(id);
            }}
            value=""
            className="bg-gray-700 rounded px-2 py-1 text-xs"
          >
            <option value="">Load Recording ({savedRecordings.length})</option>
            {savedRecordings.map((rec) => (
              <option key={rec.id} value={rec.id}>
                {rec.name} ({rec.tickCount} ticks)
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        <button onClick={() => setShowLogs(!showLogs)}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
          {showLogs ? '▼ Hide Log' : '▶ Show Log'}
        </button>
      </div>

      {/* Goal Bar */}
      <div className="bg-gray-800/50 px-2 py-1 flex gap-2 border-b border-gray-700">
        <input type="text" value={worldGoal} onChange={(e) => setWorldGoal(e.target.value)}
          placeholder="World goal..." className="flex-1 bg-gray-700 rounded px-2 py-1 text-xs" />
        <button onClick={handleSetGoal} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">Set Goal</button>
        <input type="text" value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleBroadcast()}
          placeholder="Broadcast to all..." className="w-48 bg-gray-700 rounded px-2 py-1 text-xs" />
        <button onClick={handleBroadcast} disabled={!broadcastMessage.trim()}
          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-xs">Send</button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Playback Mode */}
        {playbackMode && playbackRecording ? (
          <>
            {/* Playback Controls Bar */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-purple-900/90 px-4 py-2 flex items-center gap-4 border-b border-purple-500">
              <span className="text-purple-300 font-semibold">▶ PLAYBACK MODE</span>
              <span className="text-purple-200 text-sm">{playbackRecording.name}</span>

              <div className="h-4 w-px bg-purple-500" />

              <button onClick={handlePlayPause}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm">
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-300">Speed:</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="bg-purple-700 rounded px-2 py-1 text-xs"
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value={8}>8x</option>
                </select>
              </div>

              <div className="flex-1 flex items-center gap-2">
                <span className="text-xs text-purple-300">Tick {playbackTick + 1}/{playbackRecording.ticks.length}</span>
                <input
                  type="range"
                  min={0}
                  max={playbackRecording.ticks.length - 1}
                  value={playbackTick}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="flex-1"
                />
              </div>

              <button onClick={handleExitPlayback}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm">
                Back to Simulation
              </button>

              {/* Delete this recording if it's a saved one */}
              {playbackRecording && savedRecordings.some(r => r.id === playbackRecording.id) && (
                <button onClick={() => {
                  if (playbackRecording && confirm('Delete this recording?')) {
                    deleteRecording(playbackRecording.id);
                    handleExitPlayback();
                  }
                }}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm">
                  Delete
                </button>
              )}
            </div>

            {/* Playback Map View */}
            <div className="w-full bg-gray-950 flex flex-col overflow-hidden pt-14">
              <div className="flex-1 flex">
                {/* Map */}
                <div className="w-1/2 flex items-center justify-center p-4 overflow-hidden">
                  {(() => {
                    const tickData = getPlaybackData();
                    if (!tickData) return <div className="text-gray-500">No data</div>;
                    return (
                      <PlaybackMap
                        world={playbackRecording.initialWorld}
                        agents={tickData.agents}
                        speeches={tickData.speeches}
                      />
                    );
                  })()}
                </div>

                {/* Playback Info Panel */}
                <div className="w-1/2 border-l border-gray-700 p-4 overflow-y-auto">
                  {(() => {
                    const tickData = getPlaybackData();
                    if (!tickData) return null;

                    return (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-lg font-semibold text-purple-300 mb-2">
                            Tick {tickData.tick}
                          </h3>
                          <div className="text-xs text-gray-500">
                            {new Date(tickData.timestamp).toLocaleTimeString()}
                          </div>
                        </div>

                        {/* Events this tick */}
                        {tickData.events.length > 0 && (
                          <div className="bg-gray-800 rounded p-3">
                            <h4 className="text-yellow-400 text-sm mb-2">Events</h4>
                            <div className="space-y-1">
                              {tickData.events.map((event, i) => (
                                <div key={i} className="text-xs">
                                  <span className="text-cyan-400">{event.agentName}:</span>{' '}
                                  <span className="text-gray-300">{event.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Speeches this tick */}
                        {tickData.speeches.length > 0 && (
                          <div className="bg-purple-900/30 rounded p-3 border border-purple-500/50">
                            <h4 className="text-purple-400 text-sm mb-2">Speeches</h4>
                            <div className="space-y-2">
                              {tickData.speeches.map((speech, i) => (
                                <div key={i} className="text-xs">
                                  <span className="text-cyan-400 font-semibold">{speech.agentName}</span>
                                  {speech.isBroadcast ? (
                                    <span className="text-gray-500"> (broadcast)</span>
                                  ) : (
                                    <span className="text-gray-500"> → {state?.agents.find(a => a.id === speech.targetAgentId)?.name || 'someone'}</span>
                                  )}
                                  <div className="text-white mt-0.5 pl-2 border-l-2 border-purple-500">
                                    &quot;{speech.message}&quot;
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Agent States */}
                        <div className="bg-gray-800 rounded p-3">
                          <h4 className="text-green-400 text-sm mb-2">Agents</h4>
                          <div className="grid grid-cols-1 gap-2">
                            {tickData.agents.map((agent) => (
                              <div key={agent.id} className="bg-gray-700 rounded p-2 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="font-semibold">{agent.name}</span>
                                  <span className="text-gray-400">({agent.position.x}, {agent.position.y})</span>
                                </div>
                                {/* Health/Hunger in playback */}
                                {agent.health !== undefined && (
                                  <div className="flex gap-2 mt-1">
                                    <span className={`text-[10px] ${(agent.health ?? 100) > 50 ? 'text-green-400' : (agent.health ?? 100) > 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                                      ♥{agent.health}
                                    </span>
                                    <span className={`text-[10px] ${(agent.hunger ?? 100) > 40 ? 'text-green-400' : (agent.hunger ?? 100) > 20 ? 'text-orange-400' : 'text-red-400'}`}>
                                      🍖{agent.hunger}
                                    </span>
                                  </div>
                                )}
                                <div className="text-gray-400 mt-1">
                                  State: <span className={
                                    agent.state === 'thinking' ? 'text-yellow-400' :
                                    agent.state === 'acting' ? 'text-green-400' : 'text-gray-400'
                                  }>{agent.state}</span>
                                </div>
                                {agent.lastThought && (
                                  <div className="text-purple-300 italic mt-1 text-[11px]">
                                    &quot;{agent.lastThought.slice(0, 100)}{agent.lastThought.length > 100 ? '...' : ''}&quot;
                                  </div>
                                )}
                                {agent.inventory.length > 0 && (
                                  <div className="mt-1 flex gap-1 flex-wrap">
                                    {agent.inventory.map((item, i) => (
                                      <span key={i} className="bg-gray-600 px-1 rounded text-[10px]">
                                        {item.amount} {item.type}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </>
        ) : (
        <>
        {/* Left: Map - sized to fit height */}
        <div className="shrink-0 bg-gray-950 flex items-center overflow-hidden">
          {state && <GameMap world={state.world} agents={state.agents} mobs={state.mobs} onAgentClick={handleSelectAgent} selectedAgentId={selectedAgentId} recentMessages={recentMessages} />}
        </div>

        {/* Right: Agents Panel - fills remaining width */}
        <div className="flex-1 min-w-0 border-l border-gray-700 flex flex-col overflow-hidden">
          {/* Agent List */}
          <div className="p-2 border-b border-gray-700">
            <div className="flex gap-1 flex-wrap">
              {state?.agents.map((agent) => (
                <button key={agent.id} onClick={() => handleSelectAgent(agent.id)}
                  className={`px-2 py-1 rounded text-xs flex items-center gap-1 relative overflow-hidden ${
                    selectedAgentId === agent.id ? 'bg-blue-600' :
                    agent.role === 'leader' ? 'bg-yellow-800 hover:bg-yellow-700' :
                    'bg-gray-700 hover:bg-gray-600'
                  }`}>
                  <span className={agent.state === 'thinking' ? 'text-yellow-400' : agent.state === 'acting' ? 'text-green-400' : ''}>
                    {agent.name}
                  </span>
                  <span className="text-gray-400 text-[10px]">({agent.role === 'leader' ? '👑' : agent.role.slice(0,4)})</span>
                  {/* Health/Hunger indicators */}
                  <span className={`text-[10px] ${agent.health > 50 ? 'text-green-400' : agent.health > 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                    ♥{agent.health}
                  </span>
                  {agent.hunger < 30 && (
                    <span className="text-orange-400 text-[10px]">🍖{agent.hunger}</span>
                  )}
                  {!agent.assignedGoal && agent.role !== 'leader' && (
                    <span className="text-orange-400 text-[10px]">⏳</span>
                  )}
                  {agent.assignedGoal && (
                    <span className="text-green-400 text-[10px]">🎯</span>
                  )}
                  {agent.memory.conversations.filter(m => !m.read).length > 0 && (
                    <span className="px-1 bg-red-500 text-white text-[10px] rounded-full">
                      {agent.memory.conversations.filter(m => !m.read).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Agent Details */}
          <div className="flex-1 overflow-y-auto p-2">
            {selectedAgent && selectedAgentContext ? (
              <div className="space-y-2">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h2 className="font-semibold">{selectedAgent.name} <span className="text-gray-400 text-xs">({selectedAgent.role})</span></h2>
                  <span className="text-xs text-gray-400">({selectedAgent.position.x}, {selectedAgent.position.y})</span>
                </div>

                {/* Health & Hunger Bars */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-gray-400">Health</span>
                      <span className={selectedAgent.health > 50 ? 'text-green-400' : selectedAgent.health > 25 ? 'text-yellow-400' : 'text-red-400'}>
                        {selectedAgent.health}/100
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded overflow-hidden">
                      <div className={`h-full transition-all ${selectedAgent.health > 50 ? 'bg-green-500' : selectedAgent.health > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${selectedAgent.health}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-gray-400">Hunger</span>
                      <span className={selectedAgent.hunger > 40 ? 'text-green-400' : selectedAgent.hunger > 20 ? 'text-orange-400' : 'text-red-400'}>
                        {selectedAgent.hunger}/100
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded overflow-hidden">
                      <div className={`h-full transition-all ${selectedAgent.hunger > 40 ? 'bg-green-500' : selectedAgent.hunger > 20 ? 'bg-orange-500' : 'bg-red-500'}`}
                        style={{ width: `${selectedAgent.hunger}%` }} />
                    </div>
                  </div>
                </div>

                {/* Agent Goal */}
                <div className="bg-blue-900/30 rounded p-2 border border-blue-500/50">
                  <div className="text-blue-400 text-xs mb-1">
                    Assigned Goal {selectedAgent.role === 'leader' && <span className="text-yellow-400">(Chief - required)</span>}
                  </div>
                  {selectedAgent.assignedGoal ? (
                    <div className="text-blue-200 text-sm mb-1">🎯 {selectedAgent.assignedGoal}</div>
                  ) : (
                    <div className="text-gray-500 text-xs mb-1">No goal assigned</div>
                  )}
                  <div className="flex gap-1">
                    <input type="text" value={agentGoalInput} onChange={(e) => setAgentGoalInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSetAgentGoal()}
                      placeholder="Set goal..."
                      className="flex-1 bg-gray-700 rounded px-2 py-1 text-xs" />
                    <button onClick={handleSetAgentGoal}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">Set</button>
                    {selectedAgent.assignedGoal && (
                      <button onClick={handleClearAgentGoal}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs">Clear</button>
                    )}
                  </div>
                </div>

                {/* Direct Message */}
                <div className="flex gap-1">
                  <input type="text" value={directMessage} onChange={(e) => setDirectMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDirectMessage()}
                    placeholder={`Message ${selectedAgent.name}...`}
                    className="flex-1 bg-gray-700 rounded px-2 py-1 text-xs" />
                  <button onClick={handleDirectMessage} disabled={!directMessage.trim()}
                    className="px-2 py-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded text-xs">Send</button>
                </div>

                {/* Agent's View + Summary Row */}
                <div className="flex gap-2">
                  {/* Agent's View - Nearby Tiles Grid */}
                  <div className="bg-gray-800 rounded p-2 shrink-0">
                    <div className="text-gray-400 text-xs mb-1">View (5x5)</div>
                    <div className="grid grid-cols-5 gap-0.5 w-fit">
                      {Array.from({ length: 5 }, (_, dy) =>
                        Array.from({ length: 5 }, (_, dx) => {
                          const x = selectedAgent.position.x + dx - 2;
                          const y = selectedAgent.position.y + (2 - dy); // Flip Y so north is at top
                          const nearbyTile = selectedAgentContext.nearbyTiles.find(
                            t => t.position.x === x && t.position.y === y
                          );
                          const otherAgent = state?.agents.find(
                            a => a.position.x === x && a.position.y === y && a.id !== selectedAgent.id
                          );
                          const isCenter = dx === 2 && dy === 2;

                          const getTileBgMini = (type: TileType): string => {
                            switch (type) {
                              case TileType.GRASS: return 'bg-green-700';
                              case TileType.WATER: return 'bg-blue-500';
                              case TileType.STONE: return 'bg-gray-500';
                              case TileType.TREE: return 'bg-green-500';
                              case TileType.FARMLAND: return 'bg-yellow-700';
                              case TileType.SAND: return 'bg-yellow-300';
                              case TileType.BRIDGE: return 'bg-amber-600';
                              default: return 'bg-gray-800';
                            }
                          };

                          const getStructureIcon = (type: StructureType): string => {
                            switch (type) {
                              case StructureType.SHELTER: return '🏠';
                              case StructureType.STORAGE: return '📦';
                              case StructureType.FENCE: return '▢';
                              case StructureType.WORKSHOP: return '🔨';
                              case StructureType.WELL: return '💧';
                              default: return '?';
                            }
                          };

                          const getCropIcon = (state: CropState): string => {
                            switch (state) {
                              case CropState.SEED: return '·';
                              case CropState.GROWING: return '🌱';
                              case CropState.MATURE: return '🌾';
                              default: return '';
                            }
                          };

                          if (isCenter) {
                            return (
                              <div key={`${dx}-${dy}`}
                                className="w-6 h-6 bg-red-500 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-white"
                                title={`You (${x},${y})`}>
                                {selectedAgent.name[0]}
                              </div>
                            );
                          }

                          if (otherAgent) {
                            return (
                              <div key={`${dx}-${dy}`}
                                className="w-6 h-6 bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold"
                                title={`${otherAgent.name} (${x},${y})`}>
                                {otherAgent.name[0]}
                              </div>
                            );
                          }

                          if (!nearbyTile) {
                            return (
                              <div key={`${dx}-${dy}`}
                                className="w-6 h-6 bg-gray-900 flex items-center justify-center text-gray-600 text-[8px]"
                                title={`Unknown (${x},${y})`}>
                                ?
                              </div>
                            );
                          }

                          const tile = nearbyTile.tile;
                          return (
                            <div key={`${dx}-${dy}`}
                              className={`w-6 h-6 ${getTileBgMini(tile.type)} flex items-center justify-center text-[10px]`}
                              title={`${tile.structure ? tile.structure.type : tile.crop ? `${tile.crop.state} crop` : tile.type} (${x},${y})${tile.resource ? ` - ${tile.resourceAmount} ${tile.resource}` : ''}`}>
                              {tile.structure ? getStructureIcon(tile.structure.type) :
                               tile.crop ? getCropIcon(tile.crop.state) :
                               tile.resource && tile.resourceAmount ? '•' : ''}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="text-[9px] text-gray-500 mt-1">Red=you, •=resource</div>
                  </div>

                  {/* Quick Stats 2x2 Grid */}
                  <div className="flex-1 grid grid-cols-2 gap-1 min-w-0 text-xs">
                    {/* Inventory */}
                    <div className="bg-gray-800 rounded p-1.5">
                      <div className="text-gray-400 text-[10px] mb-0.5">Inventory</div>
                      {selectedAgent.inventory.length === 0 ? (
                        <span className="text-gray-500 text-[10px]">Empty</span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {selectedAgent.inventory.map((item, i) => {
                            const bgColor = item.type === 'wood' ? 'bg-amber-700' :
                              item.type === 'stone' ? 'bg-gray-500' :
                              item.type === 'food' ? 'bg-red-500' :
                              item.type === 'ore' ? 'bg-orange-600' :
                              item.type === 'crop' ? 'bg-green-500' :
                              item.type === 'seed' ? 'bg-lime-600' :
                              item.type === 'tool' ? 'bg-cyan-600' :
                              'bg-purple-500';
                            return (
                              <div key={i} className={`${bgColor} px-1.5 py-0.5 rounded text-white text-[10px]`}>
                                {item.amount} {item.type}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Nearby Agents */}
                    <div className="bg-gray-800 rounded p-1.5">
                      <div className="text-gray-400 text-[10px] mb-0.5">Nearby</div>
                      {selectedAgentContext.nearbyAgents.length === 0 ? (
                        <span className="text-gray-500 text-[10px]">No one</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {selectedAgentContext.nearbyAgents.slice(0, 3).map(({agent: a, distance}) => (
                            <span key={a.id} className="text-[10px]">
                              <span className="text-cyan-400">{a.name}</span>
                              <span className="text-gray-500 ml-0.5">{distance}t</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent Actions */}
                    <div className="bg-gray-800 rounded p-1.5">
                      <div className="text-gray-400 text-[10px] mb-0.5">Actions</div>
                      <div className="text-gray-500 text-[10px] max-h-12 overflow-y-auto">
                        {selectedAgent.memory.recentEvents.slice(-3).map((e, i) => (
                          <div key={i} className="truncate">- {e}</div>
                        ))}
                      </div>
                    </div>

                    {/* Exploration */}
                    <div className="bg-gray-800 rounded p-1.5">
                      <div className="text-gray-400 text-[10px] mb-0.5">Explored</div>
                      <div className="text-green-400 text-[10px]">{Object.keys(selectedAgent.memory.exploredTiles).length} tiles</div>
                      {selectedAgent.memory.previousPositions.length > 0 && (
                        <div className="text-gray-500 text-[9px]">
                          {selectedAgent.memory.previousPositions.slice(-2).map(p => `(${p.x},${p.y})`).join('→')}→now
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Last Thought */}
                {selectedAgent.lastThought && (
                  <div className="bg-purple-900/30 rounded p-2 text-xs text-purple-300 italic">
                    &quot;{selectedAgent.lastThought}&quot;
                  </div>
                )}

                {/* Grid of Info Panels */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Goals */}
                  <div className="bg-gray-800 rounded p-2 col-span-2">
                    <div className="text-gray-400 mb-1">Goals</div>
                    {selectedAgent.memory.goals.length === 0 ? (
                      <span className="text-gray-500">No goals</span>
                    ) : (
                      <div className="space-y-0.5">
                        {selectedAgent.memory.goals.filter(g => g.status !== 'completed').map(goal => (
                          <div key={goal.id} className={goal.status === 'in_progress' ? 'text-yellow-400' : 'text-blue-400'}>
                            {goal.status === 'in_progress' ? '▶' : '○'} {goal.description}
                          </div>
                        ))}
                        {selectedAgent.memory.goals.filter(g => g.status === 'completed').length > 0 && (
                          <div className="text-green-500/60">✓ {selectedAgent.memory.goals.filter(g => g.status === 'completed').length} done</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Trade Offers */}
                  {selectedAgent.memory.incomingOffers && selectedAgent.memory.incomingOffers.length > 0 && (
                    <div className="bg-orange-900/30 rounded p-2 col-span-2 border border-orange-500/50">
                      <div className="text-orange-400 mb-1">
                        Pending Trade Offers ({selectedAgent.memory.incomingOffers.length})
                      </div>
                      <div className="space-y-1">
                        {selectedAgent.memory.incomingOffers.map((offer) => (
                          <div key={offer.id} className="text-orange-200 text-[11px]">
                            <span className="text-cyan-400">{offer.fromAgentName}</span> offers{' '}
                            <span className="text-green-400">{offer.offering.amount} {offer.offering.type}</span> for{' '}
                            <span className="text-red-400">{offer.requesting.amount} {offer.requesting.type}</span>
                            <span className="text-gray-500 ml-1">(expires tick {offer.expiresAt})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="bg-gray-800 rounded p-2 col-span-2">
                    <div className="text-gray-400 mb-1">
                      Messages
                      {selectedAgentContext.recentMessages.filter(m => !m.read).length > 0 && (
                        <span className="ml-1 px-1 bg-red-500 text-white text-[10px] rounded">
                          {selectedAgentContext.recentMessages.filter(m => !m.read).length} new
                        </span>
                      )}
                    </div>
                    {selectedAgentContext.recentMessages.length === 0 ? (
                      <span className="text-gray-500">No messages</span>
                    ) : (
                      <div className="space-y-0.5 max-h-20 overflow-y-auto">
                        {selectedAgentContext.recentMessages.map((msg, i) => (
                          <div key={i} className={msg.read ? 'text-gray-500' : 'text-yellow-300'}>
                            {!msg.read && <span className="text-yellow-400">[NEW] </span>}
                            <span className="text-cyan-400">{msg.from}:</span> {msg.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Prompt Toggle */}
                <button onClick={() => setShowPrompt(!showPrompt)}
                  className="text-xs text-gray-500 hover:text-gray-300">
                  {showPrompt ? '▼ Hide Prompt' : '▶ Show LLM Prompt'}
                </button>
                {showPrompt && simulation && (() => {
                  const prompt = simulation.getAgentPrompt(selectedAgentId!);
                  if (!prompt) return null;
                  return (
                    <div className="space-y-2">
                      <div className="bg-gray-800 rounded p-2">
                        <div className="text-yellow-400 text-xs mb-1">System:</div>
                        <pre className="text-[10px] text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto">{prompt.systemPrompt}</pre>
                      </div>
                      <div className="bg-gray-800 rounded p-2">
                        <div className="text-green-400 text-xs mb-1">Context:</div>
                        <pre className="text-[10px] text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto">{prompt.userPrompt}</pre>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-8">
                Click an agent to view details
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Collapsible Log */}
      {showLogs && (
        <div className="h-48 border-t border-gray-700 bg-black p-2 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for simulation...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={getLogColor(log.type)}>{formatLog(log)}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
