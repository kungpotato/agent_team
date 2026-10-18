import path from 'path';
import fs from 'fs';
import os from 'os';
import { Agent, AgentStatus, RoomType, ServerState, MeetingQueueItem, RoomStatusInfo, VisitSession, SprintState, SprintPhase, SprintCeremonyInfo, SprintRecord, CardSourceProvider, StoryCard, DepartmentId, DepartmentInfo, DEPARTMENTS, resolveDepartmentByRole, MEETING_ROOMS, resolveRoomId, SessionSummary } from './types.js';
import { potatoAgentRegistry } from './potato-agents.js';
import { cardManager } from './cards.js';

export const SPRINT_CEREMONIES: {
  phase: SprintPhase;
  phaseIndex: number;
  name: string;
  shortName: string;
  description: string;
  room?: number;
  roles: string[];
  defaultTopic: string;
}[] = [
  {
    phase: 'validation',
    phaseIndex: 1,
    name: 'Story Refinement & Validation',
    shortName: '1. VALIDATION',
    description: 'PO brings story cards to dev/architect for refinement and validation.',
    room: 2,
    roles: ['product-manager', 'system-architect', 'coder'],
    defaultTopic: 'Story Validation & AC Refinement'
  },
  {
    phase: 'grooming',
    phaseIndex: 2,
    name: 'Backlog Grooming & Point Estimation',
    shortName: '2. GROOMING',
    description: 'Dev, QA, and PO discuss story cards and estimate story points.',
    room: 1,
    roles: ['product-manager', 'coder', 'qa-tester', 'code-reviewer', 'system-architect'],
    defaultTopic: 'Backlog Grooming & Point Estimation'
  },
  {
    phase: 'planning',
    phaseIndex: 3,
    name: 'Sprint Planning & Task Distribution',
    shortName: '3. PLANNING',
    description: 'All relevant agents gather in Boardroom to distribute and commit to sprint tasks.',
    room: 5,
    roles: ['project-planner', 'product-manager', 'system-architect', 'coder', 'code-reviewer', 'qa-tester', 'runtime-sre', 'devops-release'],
    defaultTopic: 'Sprint Planning: Task Distribution'
  },
  {
    phase: 'working',
    phaseIndex: 4,
    name: 'Sprint Execution (Active Work)',
    shortName: '4. SPRINT WORK',
    description: 'All agents work at their desks with typing animations and task HUDs.',
    roles: ['product-manager', 'project-planner', 'system-architect', 'ui-ux-designer', 'design-to-code', 'coder', 'code-reviewer', 'qa-tester', 'runtime-sre', 'devops-release'],
    defaultTopic: 'Sprint Execution in Progress'
  },
  {
    phase: 'demo',
    phaseIndex: 5,
    name: 'Sprint Feature Demo',
    shortName: '5. DEMO',
    description: 'Dev team demonstrates completed features live to PO and stakeholders.',
    room: 3,
    roles: ['coder', 'ui-ux-designer', 'qa-tester', 'product-manager'],
    defaultTopic: 'Sprint Feature Showcase & Live Demo'
  },
  {
    phase: 'uat',
    phaseIndex: 6,
    name: 'UAT Verification & Formal Sign-Off',
    shortName: '6. UAT SIGN-OFF',
    description: 'PO and QA verify acceptance criteria, review test results, and grant formal UAT sign-off.',
    room: 2,
    roles: ['product-manager', 'qa-tester', 'coder', 'system-architect'],
    defaultTopic: 'UAT Acceptance Criteria Review & Sign-Off'
  },
  {
    phase: 'release',
    phaseIndex: 7,
    name: 'Production Release & Canary Rollout',
    shortName: '7. RELEASE PROD',
    description: 'DevOps and SRE deploy release artifact to production with automated canary verification.',
    room: 4,
    roles: ['devops-release', 'runtime-sre', 'coder', 'system-architect'],
    defaultTopic: 'Production Release & Canary Deployment'
  },
  {
    phase: 'retro',
    phaseIndex: 8,
    name: 'Sprint Retrospective',
    shortName: '8. RETRO',
    description: 'All agents gather in Boardroom to review sprint lessons learned and continuous improvements.',
    room: 5,
    roles: ['product-manager', 'project-planner', 'system-architect', 'coder', 'code-reviewer', 'qa-tester', 'runtime-sre', 'devops-release'],
    defaultTopic: 'Sprint Retrospective: Lessons Learned'
  }
];

export class StateManager {
  public readonly sessionId: string;
  public readonly createdAt: number = Date.now();
  public updatedAt: number = Date.now();
  private agents: Map<string, Agent> = new Map();
  private meetingTopics: Map<number, string> = new Map();
  private meetingQueue: MeetingQueueItem[] = [];
  private visits: Map<string, VisitSession> = new Map();
  private completedSprints: SprintRecord[] = [];
  private sprint: SprintState = {
    sprintNumber: 1,
    story: 'AUTH-101: Implement OAuth2 & JWT Security',
    storyPoints: 5,
    phase: 'idle',
    phaseIndex: 0,
    startedAt: Date.now(),
    history: [],
    completedSprints: []
  };
  private listeners: ((state: ServerState, event?: { type: 'spawn' | 'sleep' | 'work' | 'talk' | 'wait' | 'walk' | 'disappear'; agent: Agent }) => void)[] = [];

  constructor(sessionId: string = 'default') {
    this.sessionId = sessionId;
  }

  public subscribe(listener: (state: ServerState, event?: { type: 'spawn' | 'sleep' | 'work' | 'talk' | 'wait' | 'walk' | 'disappear'; agent: Agent }) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(event?: { type: 'spawn' | 'sleep' | 'work' | 'talk' | 'wait' | 'walk' | 'disappear'; agent: Agent }) {
    this.updatedAt = Date.now();
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state, event);
    }
  }

  public getState(): ServerState {
    const topicsObj: Record<number, string> = {};
    this.meetingTopics.forEach((val, key) => {
      topicsObj[key] = val;
    });

    return {
      agents: Array.from(this.agents.values()).sort((a, b) => a.updatedAt - b.updatedAt),
      meetingTopics: topicsObj,
      meetingQueue: [...this.meetingQueue],
      visits: Array.from(this.visits.values()),
      sprint: { ...this.sprint },
      session: this.sessionId
    };
  }

  public getSummary(): SessionSummary {
    const allAgents = Array.from(this.agents.values());
    return {
      id: this.sessionId,
      name: this.sessionId,
      agentCount: allAgents.length,
      workingCount: allAgents.filter(a => a.status === 'working').length,
      meetingCount: allAgents.filter(a => a.room === 'meeting').length,
      sprintNumber: this.sprint.sprintNumber,
      sprintPhase: this.sprint.phase,
      story: this.sprint.story,
      storyPoints: this.sprint.storyPoints,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Serialize session state for disk persistence
   */
  public serialize(): any {
    const topicsObj: Record<number, string> = {};
    this.meetingTopics.forEach((val, key) => {
      topicsObj[key] = val;
    });

    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      agents: Array.from(this.agents.values()),
      meetingTopics: topicsObj,
      meetingQueue: [...this.meetingQueue],
      visits: Array.from(this.visits.values()),
      sprint: this.sprint,
      completedSprints: this.completedSprints
    };
  }

  /**
   * Deserialize persisted data into this session state
   */
  public deserialize(data: any): void {
    if (!data) return;
    if (typeof data.updatedAt === 'number') this.updatedAt = data.updatedAt;
    if (Array.isArray(data.agents)) {
      this.agents.clear();
      for (const ag of data.agents) {
        if (ag && ag.name) {
          this.agents.set(ag.name.toLowerCase(), ag);
        }
      }
    }
    if (data.meetingTopics && typeof data.meetingTopics === 'object') {
      this.meetingTopics.clear();
      for (const [k, v] of Object.entries(data.meetingTopics)) {
        this.meetingTopics.set(Number(k), String(v));
      }
    }
    if (Array.isArray(data.meetingQueue)) {
      this.meetingQueue = data.meetingQueue;
    }
    if (Array.isArray(data.visits)) {
      this.visits.clear();
      for (const v of data.visits) {
        if (v && v.visitorName) {
          this.visits.set(v.visitorName.toLowerCase(), v);
        }
      }
    }
    if (Array.isArray(data.completedSprints)) {
      this.completedSprints = data.completedSprints;
    }
    if (data.sprint) {
      this.sprint = {
        ...data.sprint,
        completedSprints: [...this.completedSprints]
      };
    }
  }



  /**
   * Automatically resolve name with suffix if needed (e.g., 'dev' -> 'dev1', 'dev2')
   */
  public resolveNextName(baseRoleOrName: string): string {
    const trimmed = baseRoleOrName.trim().toLowerCase();
    const match = trimmed.match(/^([a-z_-]+)(\d+)$/i);
    if (match) {
      return trimmed;
    }

    const base = trimmed;
    let nextNum = 1;
    while (this.agents.has(`${base}${nextNum}`)) {
      nextNum++;
    }
    return `${base}${nextNum}`;
  }

  /**
   * Find an available desk slot in work room
   */
  private findAvailableWorkSlot(): number {
    const occupied = new Set(
      Array.from(this.agents.values())
        .filter(a => a.room === 'work')
        .map(a => a.slot)
    );
    let slot = 0;
    while (occupied.has(slot)) {
      slot++;
    }
    return slot;
  }

  /**
   * Find an available slot on a specific bench (0..4), fallback to any slot
   */
  private findAvailableBenchSlot(benchIndex: number): number {
    const occupied = new Set(
      Array.from(this.agents.values())
        .filter(a => a.room === 'work')
        .map(a => a.slot)
    );
    const start = benchIndex * 8;
    for (let s = start; s < start + 8; s++) {
      if (!occupied.has(s)) return s;
    }
    return this.findAvailableWorkSlot();
  }

  /**
   * Find an available chair slot in a specific meeting room (1..5)
   */
  private findAvailableMeetingSlot(meetingRoomId: number): number {
    const occupied = new Set(
      Array.from(this.agents.values())
        .filter(a => a.room === 'meeting' && a.meetingRoomId === meetingRoomId)
        .map(a => a.slot)
    );
    let slot = 0;
    while (occupied.has(slot)) {
      slot++;
    }
    return slot;
  }

  /**
   * Spawn a new agent or update an existing one
   */
  public spawn(roleOrName: string, initialStatus: AgentStatus = 'working', message?: string): Agent {
    let name: string;
    let role: string;

    const match = roleOrName.trim().toLowerCase().match(/^([a-z_-]+)(\d+)$/i);
    if (match) {
      name = roleOrName.trim().toLowerCase();
      role = match[1];
    } else {
      role = roleOrName.trim().toLowerCase();
      name = this.resolveNextName(role);
    }

    const potatoDef = potatoAgentRegistry.get(role);

    let agent = this.agents.get(name);
    if (agent) {
      agent.status = initialStatus;
      agent.message = message || (potatoDef ? potatoDef.defaultTask : (initialStatus === 'working' ? 'Working...' : undefined));
      agent.updatedAt = Date.now();
      this.notify({ type: initialStatus === 'sleeping' ? 'sleep' : initialStatus === 'talking' ? 'talk' : 'work', agent });
      return agent;
    }

    const dept = resolveDepartmentByRole(role);
    const targetBench = potatoDef ? potatoDef.targetBench : dept.benchIndex;
    const slot = this.findAvailableBenchSlot(targetBench);
    const colorIndex = potatoDef ? potatoDef.colorIndex : (this.agents.size + 1) % 10;
    const roleTitle = potatoDef ? potatoDef.roleTitle : role.toUpperCase();
    const defaultMsg = message || (potatoDef ? potatoDef.defaultTask : (initialStatus === 'working' ? 'Coding...' : undefined));

    agent = {
      id: name,
      name,
      role,
      roleTitle,
      department: dept.id,
      status: initialStatus,
      room: 'work',
      slot,
      message: defaultMsg,
      progress: initialStatus === 'working' ? 20 : undefined,
      color: potatoDef ? potatoDef.color : dept.color,
      colorIndex,
      updatedAt: Date.now()
    };

    this.agents.set(name, agent);
    this.notify({ type: 'spawn', agent });
    return agent;
  }

  /**
   * Spawn the entire 10-person potato-skill squad
   */
  public spawnPotatoSquad(): Agent[] {
    const spawned: Agent[] = [];
    for (const [roleName] of potatoAgentRegistry.entries()) {
      const a = this.spawn(roleName, 'working');
      spawned.push(a);
    }
    return spawned;
  }

  /**
   * Set agent to working (seated at desk, typing on laptop)
   */
  /**
   * Set agent to working (seated at desk, typing on laptop). Auto-spawns if agent does not exist!
   */
  public setWorking(name: string, task?: string, progress?: number): Agent {
    let agent = this.agents.get(name.toLowerCase());
    if (!agent) {
      agent = this.spawn(name, 'working', task || 'Working...');
    }

    if (agent.room !== 'work') {
      agent.room = 'work';
      agent.meetingRoomId = undefined;
      agent.slot = this.findAvailableWorkSlot();
    }
    agent.status = 'working';
    if (task) agent.message = task;
    if (typeof progress === 'number') {
      agent.progress = Math.max(0, Math.min(100, progress));
    } else if (agent.progress === undefined) {
      agent.progress = 25;
    }
    agent.updatedAt = Date.now();

    this.notify({ type: 'work', agent });
    return agent;
  }

  /**
   * Update task progress (0-100). Auto-spawns if agent does not exist!
   */
  public setProgress(name: string, progress: number, task?: string): Agent {
    let agent = this.agents.get(name.toLowerCase());
    if (!agent) {
      agent = this.spawn(name, 'working', task || 'Working...');
    }

    agent.status = 'working';
    agent.progress = Math.max(0, Math.min(100, progress));
    if (task) agent.message = task;
    agent.updatedAt = Date.now();

    this.notify({ type: 'work', agent });
    return agent;
  }

  /**
   * Set agent to sleeping (sitting asleep, snoring Zzz). Auto-spawns if agent does not exist!
   */
  public setSleeping(name: string): Agent {
    let agent = this.agents.get(name.toLowerCase());
    if (!agent) {
      agent = this.spawn(name, 'sleeping', 'Zzz...');
    }

    agent.status = 'sleeping';
    agent.message = 'Zzz...';
    agent.updatedAt = Date.now();

    this.notify({ type: 'sleep', agent });
    return agent;
  }

  /**
   * Set agent to talking (speech bubble, gesturing). Auto-spawns if agent does not exist!
   */
  public setTalking(name: string, message: string): Agent {
    let agent = this.agents.get(name.toLowerCase());
    if (!agent) {
      agent = this.spawn(name, 'talking', message);
    }

    agent.status = 'talking';
    agent.message = message;
    agent.updatedAt = Date.now();

    this.notify({ type: 'talk', agent });
    return agent;
  }

  /**
   * Get real-time status of meeting rooms (1..5)
   */
  public getRoomStatus(targetRoomId?: number): RoomStatusInfo[] {
    const results: RoomStatusInfo[] = [];
    const roomIds = targetRoomId ? [Math.max(1, Math.min(5, targetRoomId))] : [1, 2, 3, 4, 5];

    for (const rId of roomIds) {
      const attendees = Array.from(this.agents.values())
        .filter(a => a.room === 'meeting' && (a.meetingRoomId === rId || (!a.meetingRoomId && rId === 1)))
        .map(a => a.name);

      const occupancy = attendees.length;
      const capacity = 8;
      const isOccupied = occupancy > 0;
      const isFull = occupancy >= capacity;
      const topic = this.meetingTopics.get(rId);
      const roomInfo = MEETING_ROOMS[rId];
      const roomName = roomInfo ? roomInfo.fullName : `Room ${rId}`;

      results.push({
        roomId: rId,
        name: roomName,
        occupancy,
        capacity,
        isFull,
        isOccupied,
        topic,
        attendees
      });
    }

    return results;
  }

  /**
   * Enqueue agents waiting for a meeting room
   */
  public enqueueMeeting(names: string[], topic?: string, targetRoomId?: number | string): { queueItem: MeetingQueueItem; position: number; agents: Agent[] } {
    const cleanNames = names.map(n => n.trim().toLowerCase()).filter(Boolean);
    const resolvedRoomId = resolveRoomId(targetRoomId);
    const roomInfo = resolvedRoomId ? MEETING_ROOMS[resolvedRoomId] : undefined;
    const roomLabel = roomInfo ? roomInfo.fullName : (resolvedRoomId ? `Room ${resolvedRoomId}` : 'Meeting');
    const meetingTopic = topic || (roomInfo ? roomInfo.fullName : (resolvedRoomId ? `Meeting Room ${resolvedRoomId}` : 'Conference Sync'));
    const queueId = `Q-${Math.floor(100 + Math.random() * 900)}`;

    const waitingAgents: Agent[] = [];

    for (const rawName of cleanNames) {
      let agent = this.agents.get(rawName);
      if (!agent) {
        agent = this.spawn(rawName, 'waiting', `⏳ Waiting for ${roomLabel}`);
      } else {
        agent.status = 'waiting';
        agent.message = `⏳ Waiting for ${roomLabel}: ${meetingTopic}`;
        agent.updatedAt = Date.now();
      }
      waitingAgents.push(agent);
      this.notify({ type: 'wait', agent });
    }

    const queueItem: MeetingQueueItem = {
      id: queueId,
      names: cleanNames,
      topic: meetingTopic,
      targetRoomId: resolvedRoomId,
      queuedAt: Date.now()
    };

    this.meetingQueue.push(queueItem);
    return {
      queueItem,
      position: this.meetingQueue.length,
      agents: waitingAgents
    };
  }

  /**
   * Cancel / Dequeue a meeting request
   */
  public cancelQueue(queueIdOrName: string): MeetingQueueItem | null {
    const target = queueIdOrName.trim().toLowerCase();
    const idx = this.meetingQueue.findIndex(q =>
      q.id.toLowerCase() === target || q.names.some(n => n.toLowerCase() === target)
    );

    if (idx === -1) return null;

    const [removed] = this.meetingQueue.splice(idx, 1);
    for (const name of removed.names) {
      const agent = this.agents.get(name);
      if (agent && agent.status === 'waiting') {
        agent.status = 'working';
        agent.message = 'Back to work';
        agent.updatedAt = Date.now();
        this.notify({ type: 'work', agent });
      }
    }
    return removed;
  }

  /**
   * Move agents into a specified meeting room (1..5)
   * If the room is at capacity (8 agents) or doesn't have room for all requested agents,
   * automatically places the request into the waiting queue!
   */
  public startMeeting(
    names: string[],
    topic?: string,
    targetRoomId: number = 1,
    options?: { autoQueueIfFull?: boolean }
  ): {
    started: boolean;
    queued: boolean;
    roomId: number;
    agents?: Agent[];
    queueItem?: MeetingQueueItem;
    position?: number;
    message?: string;
  } {
    const roomId = (typeof targetRoomId === 'string' ? resolveRoomId(targetRoomId) : targetRoomId) || 1;
    const roomInfo = MEETING_ROOMS[roomId];
    const roomDisplayName = roomInfo ? roomInfo.fullName : `Room ${roomId}`;
    const autoQueue = options?.autoQueueIfFull !== false;

    // Check current occupancy in target room
    const currentOccupants = Array.from(this.agents.values()).filter(
      a => a.room === 'meeting' && (a.meetingRoomId === roomId || (!a.meetingRoomId && roomId === 1))
    );

    const availableSeats = 8 - currentOccupants.length;

    // If room is full or cannot fit all requested agents
    if (availableSeats < names.length) {
      if (autoQueue) {
        const queued = this.enqueueMeeting(names, topic || roomDisplayName, roomId);
        return {
          started: false,
          queued: true,
          roomId,
          queueItem: queued.queueItem,
          position: queued.position,
          message: `${roomDisplayName} is full (${currentOccupants.length}/8 seats taken). Agents queued at position #${queued.position}.`
        };
      } else {
        return {
          started: false,
          queued: false,
          roomId,
          message: `${roomDisplayName} is full (${currentOccupants.length}/8 seats taken, requested ${names.length}).`
        };
      }
    }

    // Room has available seats: admit them now!
    const modified: Agent[] = [];
    this.meetingTopics.set(roomId, topic || roomDisplayName);

    // Remove them from meeting queue if they were waiting
    this.meetingQueue = this.meetingQueue.filter(
      q => !q.names.some(n => names.map(x => x.toLowerCase()).includes(n.toLowerCase()))
    );

    for (const rawName of names) {
      const lower = rawName.toLowerCase();
      let agent = this.agents.get(lower);
      if (!agent) {
        agent = Array.from(this.agents.values()).find(a =>
          a.name.toLowerCase() === lower ||
          a.role.toLowerCase() === lower ||
          a.name.toLowerCase().startsWith(lower)
        );
        if (!agent) {
          agent = this.spawn(rawName, 'talking', topic || 'Discussing...');
        }
      }

      agent.room = 'meeting';
      agent.meetingRoomId = roomId;
      agent.slot = this.findAvailableMeetingSlot(roomId);
      agent.status = 'talking';
      agent.message = topic ? `Topic: ${topic}` : `In Room ${roomId}`;
      agent.updatedAt = Date.now();
      modified.push(agent);
      this.notify({ type: 'talk', agent });
    }

    return {
      started: true,
      queued: false,
      roomId,
      agents: modified,
      message: `Meeting started in Room ${roomId}`
    };
  }

  /**
   * End meeting: agents in meeting room(s) disappear as requested!
   * Automatically checks the waiting queue and admits the next queued meeting if a room became free!
   */
  public endMeeting(options?: { roomId?: number; names?: string[] }): {
    removed: Agent[];
    autoAdmitted?: { roomId: number; queueItem: MeetingQueueItem; agents: Agent[] };
  } {
    const removed: Agent[] = [];
    const targetAgents = Array.from(this.agents.values()).filter(a => a.room === 'meeting');

    const roomId = options?.roomId;
    const names = options?.names?.map(n => n.toLowerCase());

    for (const agent of targetAgents) {
      const matchRoom = roomId ? agent.meetingRoomId === roomId : true;
      const matchName = names && names.length > 0 ? names.includes(agent.name.toLowerCase()) : true;

      if (matchRoom && matchName) {
        this.agents.delete(agent.name);
        removed.push(agent);
        this.notify({ type: 'disappear', agent });
      }
    }

    // Clean up empty meeting topics
    const freedRooms: number[] = [];
    if (roomId) {
      const remainingInRoom = Array.from(this.agents.values()).filter(a => a.room === 'meeting' && a.meetingRoomId === roomId);
      if (remainingInRoom.length === 0) {
        this.meetingTopics.delete(roomId);
        freedRooms.push(roomId);
      }
    } else {
      // Check all 5 rooms
      for (let r = 1; r <= 5; r++) {
        const remainingInRoom = Array.from(this.agents.values()).filter(a => a.room === 'meeting' && a.meetingRoomId === r);
        if (remainingInRoom.length === 0) {
          this.meetingTopics.delete(r);
          freedRooms.push(r);
        }
      }
    }

    // Check waiting queue to auto-admit next meeting into freed room!
    let autoAdmitted: { roomId: number; queueItem: MeetingQueueItem; agents: Agent[] } | undefined;
    if (this.meetingQueue.length > 0 && freedRooms.length > 0) {
      for (const freedId of freedRooms) {
        const qIdx = this.meetingQueue.findIndex(q => !q.targetRoomId || q.targetRoomId === freedId);
        if (qIdx !== -1) {
          const [nextQueue] = this.meetingQueue.splice(qIdx, 1);
          const startResult = this.startMeeting(nextQueue.names, nextQueue.topic, freedId, { autoQueueIfFull: false });
          if (startResult.started && startResult.agents) {
            autoAdmitted = {
              roomId: freedId,
              queueItem: nextQueue,
              agents: startResult.agents
            };
            break; // Auto-admitted one meeting into this freed room
          }
        }
      }
    }

    return { removed, autoAdmitted };
  }


  /**
   * Remove a single agent completely
   */
  public remove(name: string): Agent | null {
    const agent = this.agents.get(name.toLowerCase());
    if (!agent) return null;

    this.agents.delete(name.toLowerCase());
    this.notify({ type: 'disappear', agent });
    return agent;
  }

  /**
   * Remove multiple agents by names, or remove all idle/sleeping agents
   */
  public removeFiltered(options: { names?: string[]; idleOnly?: boolean; sleepingOnly?: boolean }): Agent[] {
    const removed: Agent[] = [];
    const all = Array.from(this.agents.values());

    for (const agent of all) {
      let shouldRemove = false;
      if (options.names && options.names.length > 0) {
        if (options.names.map(n => n.toLowerCase()).includes(agent.name.toLowerCase())) {
          shouldRemove = true;
        }
      } else if (options.sleepingOnly) {
        if (agent.status === 'sleeping') shouldRemove = true;
      } else if (options.idleOnly) {
        if (agent.status !== 'working') shouldRemove = true;
      }

      if (shouldRemove) {
        this.agents.delete(agent.name.toLowerCase());
        removed.push(agent);
        this.notify({ type: 'disappear', agent });
      }
    }
    return removed;
  }

  /**
   * Start a desk visit: an agent walks over to another agent's desk to ask a question
   */
  public startVisit(
    fromName: string,
    toName: string,
    question: string,
    customReply?: string,
    durationSec: number = 12
  ): { visit: VisitSession; visitor: Agent; target: Agent } {
    const from = fromName.trim().toLowerCase();
    const to = toName.trim().toLowerCase();

    // Auto-spawn visitor if not present
    let visitor = this.agents.get(from);
    if (!visitor) {
      visitor = this.spawn(from, 'working', 'Consulting...');
    }

    // Auto-spawn target if not present
    let target = this.agents.get(to);
    if (!target) {
      target = this.spawn(to, 'working', 'Working...');
    }

    // If target has task / progress, generate contextual reply if omitted
    let reply = customReply;
    if (!reply) {
      if (target.message && typeof target.progress === 'number') {
        reply = `Working on "${target.message}" (${target.progress}%)!`;
      } else if (target.status === 'sleeping') {
        reply = `*yawns* Give me a moment, checking the specs...`;
      } else {
        reply = `Got it! I am on it right away.`;
      }
    }

    const visitId = `V-${Math.floor(100 + Math.random() * 900)}`;
    const session: VisitSession = {
      id: visitId,
      visitorName: visitor.name,
      targetName: target.name,
      question,
      reply,
      startedAt: Date.now(),
      durationSec,
      phase: 'walking'
    };

    // Update visitor state
    visitor.status = 'walking';
    visitor.message = `❓ Asking ${target.name}: "${question}"`;
    visitor.currentVisit = {
      partnerName: target.name,
      isVisitor: true,
      question,
      reply
    };
    visitor.updatedAt = Date.now();

    // Update target state with visit context
    target.currentVisit = {
      partnerName: visitor.name,
      isVisitor: false,
      question,
      reply
    };
    target.updatedAt = Date.now();

    this.visits.set(visitor.name.toLowerCase(), session);
    this.notify({ type: 'walk', agent: visitor });

    // Transition from walking to talking/visiting phase after walking arrival (~2.2s)
    setTimeout(() => {
      const active = this.visits.get(visitor.name.toLowerCase());
      if (active && active.id === visitId && active.phase === 'walking') {
        active.phase = 'talking';
        visitor.status = 'visiting';
        this.notify({ type: 'talk', agent: visitor });
      }
    }, 2200);

    // Auto-return timer if durationSec > 0
    if (durationSec > 0) {
      setTimeout(() => {
        const active = this.visits.get(visitor.name.toLowerCase());
        if (active && active.id === visitId && active.phase !== 'returning') {
          this.returnVisit(visitor.name);
        }
      }, durationSec * 1000);
    }

    return { visit: session, visitor, target };
  }

  /**
   * Return a visiting agent back to their home desk
   */
  public returnVisit(visitorName: string): { success: boolean; visitor?: Agent } {
    const key = visitorName.trim().toLowerCase();
    const session = this.visits.get(key);
    const visitor = this.agents.get(key);
    if (!session || !visitor) return { success: false };

    const target = this.agents.get(session.targetName.toLowerCase());
    if (target && target.currentVisit?.partnerName.toLowerCase() === key) {
      target.currentVisit = undefined;
      target.updatedAt = Date.now();
    }

    session.phase = 'returning';
    visitor.status = 'walking';
    visitor.message = 'Returning to desk...';
    visitor.updatedAt = Date.now();
    this.notify({ type: 'walk', agent: visitor });

    // After walking back (~2.2s), return to sitting at desk
    setTimeout(() => {
      this.visits.delete(key);
      if (this.agents.has(key)) {
        const v = this.agents.get(key)!;
        v.status = 'working';
        v.currentVisit = undefined;
        v.message = 'Coding...';
        v.updatedAt = Date.now();
        this.notify({ type: 'work', agent: v });
      }
    }, 2200);

    return { success: true, visitor };
  }

  /**
   * Reset / clear all agents and queues (Clock Out / Go Home)
   */
  public reset(): { count: number } {
    const count = this.agents.size;
    this.agents.clear();
    this.meetingTopics.clear();
    this.meetingQueue = [];
    this.visits.clear();
    this.sprint = {
      sprintNumber: this.sprint.sprintNumber || 1,
      story: this.sprint.story || 'AUTH-101: Implement OAuth2 & JWT Security',
      storyPoints: this.sprint.storyPoints || 5,
      phase: 'idle',
      phaseIndex: 0,
      startedAt: Date.now(),
      history: [],
      completedSprints: [...this.completedSprints]
    };
    const dummyAgent: Agent = {
      id: '_all',
      name: 'all',
      role: 'all',
      status: 'working',
      room: 'work',
      slot: 0,
      colorIndex: 0,
      updatedAt: Date.now()
    };
    this.notify({ type: 'disappear', agent: dummyAgent });
    return { count };
  }

  /**
   * Start or initialize a sprint (starts new cycle e.g. Sprint #1 -> #2 -> #3)
   * Cards can be sourced from Taskwarrior (default) or Jira
   */
  public async startSprint(
    sprintNumberOrOptions?: number | { sprintNumber?: number; story?: string; points?: number; cardId?: string; source?: CardSourceProvider },
    storyArg?: string,
    pointsArg?: number
  ): Promise<SprintState> {
    const opts = typeof sprintNumberOrOptions === 'object' && sprintNumberOrOptions !== null
      ? sprintNumberOrOptions
      : {
          sprintNumber: typeof sprintNumberOrOptions === 'number' ? sprintNumberOrOptions : undefined,
          story: storyArg,
          points: pointsArg
        };

    const isCompleted = this.sprint.phase === 'completed';
    const num = opts.sprintNumber || (isCompleted ? (this.sprint.sprintNumber || 0) + 1 : (this.sprint.sprintNumber || 1));
    const cardSrc = opts.source || 'taskwarrior';

    let card: StoryCard | undefined;
    if (opts.cardId) {
      card = await cardManager.getCard(opts.cardId, cardSrc);
    } else if (!opts.story) {
      // Default to Taskwarrior Kanban: pick the first pending card
      try {
        const pendingCards = await cardManager.getCards(cardSrc);
        const todoCard = pendingCards.find(c => c.status === 'todo');
        if (todoCard) {
          card = todoCard;
        }
      } catch {
        // Fall back gracefully
      }
    }

    if (card) {
      await cardManager.startCard(card).catch(() => {});
    }

    const storyTitle = opts.story || (card ? card.title : (isCompleted ? `FEATURE-${num}01: Continuous Delivery Increment #${num}` : (this.sprint.story || 'AUTH-101: Implement OAuth2 & JWT Security')));
    const pts = opts.points !== undefined ? opts.points : (card?.points || this.sprint.storyPoints || 5);

    // Free any active meeting rooms
    this.endMeeting();

    this.sprint = {
      sprintNumber: num,
      story: storyTitle,
      storyPoints: pts,
      phase: 'idle',
      phaseIndex: 0,
      startedAt: Date.now(),
      sourceCard: card,
      history: [],
      completedSprints: [...this.completedSprints]
    };

    const dummyAgent: Agent = {
      id: '_sprint',
      name: 'sprint',
      role: 'sprint',
      status: 'working',
      room: 'work',
      slot: 0,
      colorIndex: 0,
      updatedAt: Date.now()
    };
    this.notify({ type: 'spawn', agent: dummyAgent });
    return { ...this.sprint };
  }

  /**
   * Run a specific sprint ceremony (1: validation, 2: grooming, 3: planning, 4: working, 5: demo, 6: uat, 7: release, 8: retro)
   */
  public runCeremony(phaseOrIndex: string | number, options?: { points?: number; topic?: string; force?: boolean }): { ceremony: SprintCeremonyInfo; sprint: SprintState } {
    let target = SPRINT_CEREMONIES.find(c =>
      (typeof phaseOrIndex === 'number' && c.phaseIndex === phaseOrIndex) ||
      (typeof phaseOrIndex === 'string' && (c.phase.toLowerCase() === phaseOrIndex.toLowerCase() || String(c.phaseIndex) === phaseOrIndex))
    );

    if (!target) {
      const lower = String(phaseOrIndex).toLowerCase();
      if (lower.includes('val')) target = SPRINT_CEREMONIES[0];
      else if (lower.includes('groom') || lower.includes('point') || lower.includes('refine')) target = SPRINT_CEREMONIES[1];
      else if (lower.includes('plan')) target = SPRINT_CEREMONIES[2];
      else if (lower.includes('work') || lower.includes('exec')) target = SPRINT_CEREMONIES[3];
      else if (lower.includes('demo') || lower.includes('show')) target = SPRINT_CEREMONIES[4];
      else if (lower.includes('uat') || lower.includes('sign') || lower.includes('accept')) target = SPRINT_CEREMONIES[5];
      else if (lower.includes('rel') || lower.includes('prod') || lower.includes('deploy')) target = SPRINT_CEREMONIES[6];
      else if (lower.includes('retro')) target = SPRINT_CEREMONIES[7];
    }

    if (!target) {
      throw new Error(`Unknown ceremony phase "${phaseOrIndex}". Supported: validation, grooming, planning, working, demo, uat, release, retro (or 1..8)`);
    }

    // MANDATORY SPRINT CEREMONY POLICY ENFORCEMENT
    if (!options?.force) {
      if (target.phase === 'grooming') {
        const valDone = this.sprint.history.some(h => h.phase === 'validation') || this.sprint.phaseIndex >= 1;
        if (!valDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Backlog Grooming (Phase 2) is BLOCKED! Agents must complete Phase 1 (Story Validation & Refinement) first.`);
        }
      } else if (target.phase === 'planning') {
        const groomDone = this.sprint.history.some(h => h.phase === 'grooming') || this.sprint.phaseIndex >= 2;
        if (!groomDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Sprint Planning (Phase 3) is BLOCKED! Agents must complete Phase 2 (Backlog Grooming & Point Estimation) first.`);
        }
      } else if (target.phase === 'working') {
        const planDone = this.sprint.history.some(h => h.phase === 'planning') || this.sprint.phaseIndex >= 3;
        if (!planDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Sprint Work (Phase 4) is BLOCKED! Agents must complete Phase 1 (Validation), Phase 2 (Grooming), and Phase 3 (Planning) before active work.`);
        }
      } else if (target.phase === 'demo') {
        const workDone = this.sprint.history.some(h => h.phase === 'working') || this.sprint.phaseIndex >= 4;
        if (!workDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Sprint Demo (Phase 5) is BLOCKED! Agents must complete Phase 4 (Sprint Execution / Active Work) first.`);
        }
      } else if (target.phase === 'uat') {
        const demoDone = this.sprint.history.some(h => h.phase === 'demo') || this.sprint.phaseIndex >= 5;
        if (!demoDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: UAT Sign-Off (Phase 6) is BLOCKED! Agents must complete Phase 5 (Sprint Demo) before formal UAT verification.`);
        }
      } else if (target.phase === 'release') {
        const uatDone = this.sprint.history.some(h => h.phase === 'uat') || this.sprint.phaseIndex >= 6;
        if (!uatDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Production Release (Phase 7) is BLOCKED! All agents must complete Phase 6 (UAT Verification & Formal Sign-Off) before releasing to production.`);
        }
      } else if (target.phase === 'retro') {
        const relDone = this.sprint.history.some(h => h.phase === 'release') || this.sprint.phaseIndex >= 7;
        if (!relDone) {
          throw new Error(`🚫 CEREMONY POLICY VIOLATION: Sprint Retrospective (Phase 8) is BLOCKED! Agents must complete Phase 7 (Production Release) before conducting the retrospective.`);
        }
      }
    }

    if (options?.points !== undefined) {
      this.sprint.storyPoints = options.points;
    }

    const topic = options?.topic || `${target.shortName}: ${this.sprint.story} ${this.sprint.storyPoints ? `(${this.sprint.storyPoints} pts)` : ''}`;

    // Execute ceremony flow
    if (target.room !== undefined) {
      // Free the room first so attendees can cleanly enter
      this.endMeeting({ roomId: target.room });

      // 1. Gather attendees for meeting
      const attendeeNames: string[] = [];
      for (const role of target.roles) {
        const lower = role.toLowerCase();
        let agent = Array.from(this.agents.values()).find(a =>
          a.name.toLowerCase() === lower ||
          a.role.toLowerCase() === lower ||
          a.name.toLowerCase().startsWith(lower)
        );
        if (!agent) {
          agent = this.spawn(role, 'working', 'Joining ceremony');
        }
        attendeeNames.push(agent.name);
      }

      this.startMeeting(attendeeNames, topic, target.room);
    } else {
      // Phase 4: SPRINT WORK (everyone back to desks)
      this.endMeeting(); // Free meeting rooms

      const SPRINT_TASKS: Record<string, { task: string; progress: number }> = {
        'product-manager': { task: 'Tracking acceptance criteria', progress: 40 },
        'project-planner': { task: 'Monitoring DAG wave execution', progress: 50 },
        'system-architect': { task: 'Verifying OpenAPI specs', progress: 60 },
        'ui-ux-designer': { task: 'Polishing interactive UI design', progress: 55 },
        'design-to-code': { task: 'Translating tokens to components', progress: 65 },
        'coder': { task: 'Implementing core logic & unit tests', progress: 75 },
        'code-reviewer': { task: 'AST security rules verification', progress: 70 },
        'qa-tester': { task: 'Synthesizing fuzz test suite', progress: 65 },
        'runtime-sre': { task: 'Analyzing latency telemetry SLO', progress: 80 },
        'devops-release': { task: 'Configuring Canary rollout pipeline', progress: 60 }
      };

      for (const role of target.roles) {
        const lower = role.toLowerCase();
        let agent = Array.from(this.agents.values()).find(a =>
          a.name.toLowerCase() === lower ||
          a.role.toLowerCase() === lower ||
          a.name.toLowerCase().startsWith(lower)
        );
        if (!agent) {
          agent = this.spawn(role, 'working', 'Coding...');
        }
        const taskInfo = SPRINT_TASKS[role] || { task: 'Sprint Task Execution', progress: 50 };
        this.setWorking(agent.name, taskInfo.task, taskInfo.progress);
      }
    }

    const ceremonyInfo: SprintCeremonyInfo = {
      phase: target.phase,
      phaseIndex: target.phaseIndex,
      name: target.name,
      shortName: target.shortName,
      description: target.description,
      room: target.room,
      attendees: [...target.roles],
      topic,
      startedAt: Date.now()
    };

    this.sprint.phase = target.phase;
    this.sprint.phaseIndex = target.phaseIndex;
    this.sprint.activeCeremony = ceremonyInfo;
    this.sprint.history.push({
      phase: target.phase,
      timestamp: Date.now(),
      summary: topic
    });

    const dummyAgent: Agent = {
      id: '_ceremony',
      name: 'ceremony',
      role: 'ceremony',
      status: 'working',
      room: 'work',
      slot: 0,
      colorIndex: 0,
      updatedAt: Date.now()
    };
    this.notify({ type: 'spawn', agent: dummyAgent });

    return { ceremony: ceremonyInfo, sprint: { ...this.sprint } };
  }

  /**
   * Advance to the next sprint ceremony in sequence (1 -> 8)
   */
  /**
   * Advance to the next sprint ceremony in sequence (1 -> 8 -> complete)
   */
  public nextCeremony(): { ceremony?: SprintCeremonyInfo; sprint: SprintState; completed?: boolean } {
    if (this.sprint.phaseIndex === 8 || this.sprint.phase === 'retro') {
      const res = this.completeSprint();
      return { sprint: res.sprint, completed: true };
    }
    let nextIndex = this.sprint.phaseIndex + 1;
    if (nextIndex > SPRINT_CEREMONIES.length) nextIndex = 1;
    return this.runCeremony(nextIndex);
  }

  /**
   * Complete the current sprint after retrospective and archive it
   */
  public completeSprint(summary?: string): { sprint: SprintState; record: SprintRecord } {
    if (this.sprint.phase === 'completed') {
      throw new Error(`Sprint #${this.sprint.sprintNumber} is already marked as COMPLETED.`);
    }

    // Governance: Retrospective (Ceremony 8) must have been completed!
    const retroDone = this.sprint.history.some(h => h.phase === 'retro') || this.sprint.phaseIndex === 8;
    if (!retroDone) {
      throw new Error(`🚫 CEREMONY POLICY VIOLATION: Cannot complete sprint #${this.sprint.sprintNumber}! You must complete Ceremony 8 (Sprint Retrospective) before completing the sprint.`);
    }

    const completedAt = Date.now();
    const record: SprintRecord = {
      sprintNumber: this.sprint.sprintNumber,
      story: this.sprint.story,
      storyPoints: this.sprint.storyPoints,
      startedAt: this.sprint.startedAt,
      completedAt,
      ceremoniesCount: this.sprint.history.length,
      summary: summary || `Sprint #${this.sprint.sprintNumber} ("${this.sprint.story}") completed successfully (${this.sprint.storyPoints || 5} pts).`,
      sourceCard: this.sprint.sourceCard
    };

    if (this.sprint.sourceCard) {
      cardManager.completeCard(this.sprint.sourceCard).catch(() => {});
    }

    this.completedSprints.push(record);

    this.sprint.phase = 'completed';
    this.sprint.phaseIndex = 9;
    this.sprint.completedAt = completedAt;
    this.sprint.activeCeremony = undefined;
    this.sprint.completedSprints = [...this.completedSprints];

    // Clear meeting rooms
    this.endMeeting();

    const dummyAgent: Agent = {
      id: '_sprint_completed',
      name: 'sprint_completed',
      role: 'sprint',
      status: 'working',
      room: 'work',
      slot: 0,
      colorIndex: 0,
      updatedAt: Date.now()
    };
    this.notify({ type: 'spawn', agent: dummyAgent });

    // Auto-generate markdown sprint report in docs/sprints/sprint_<N>_report.md
    try {
      const reportDir = path.join(process.cwd(), 'docs', 'sprints');
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      const reportFileName = `sprint_${record.sprintNumber}_report.md`;
      const reportPath = path.join(reportDir, reportFileName);
      const mdContent = this.generateSprintMarkdownReport(record);
      fs.writeFileSync(reportPath, mdContent, 'utf-8');
      record.reportPath = reportPath;
    } catch (err) {
      console.error(`[StateManager] Failed to write sprint markdown report:`, err);
    }

    return { sprint: { ...this.sprint }, record };
  }

  private formatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0 || hours > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  public generateSprintMarkdownReport(record: SprintRecord): string {
    const started = new Date(record.startedAt);
    const completed = new Date(record.completedAt);
    const duration = this.formatDuration(record.completedAt - record.startedAt);

    const historyRows = this.sprint.history.map((h, i) => {
      const timeStr = new Date(h.timestamp).toLocaleTimeString();
      const phaseInfo = SPRINT_CEREMONIES.find(c => c.phase === h.phase);
      const ceremonyName = phaseInfo?.name || h.phase.toUpperCase();
      const roomStr = phaseInfo?.room ? `Room ${phaseInfo.room} (${MEETING_ROOMS[phaseInfo.room]?.symbol || ''} ${MEETING_ROOMS[phaseInfo.room]?.name || ''})` : 'Open-Space Desks';
      return `| ${i + 1} | **${ceremonyName}** | ${roomStr} | \`${timeStr}\` | ${h.summary} |`;
    }).join('\n');

    let cardBlock = '';
    if (record.sourceCard) {
      const c = record.sourceCard;
      const tagsStr = c.tags && c.tags.length ? c.tags.map(t => `\`${t}\``).join(', ') : 'None';
      cardBlock = `
## 📋 Source Story Card (Backlog)
- **Card ID:** \`${c.id}\`
- **Title:** ${c.title}
- **Provider:** \`${c.source.toUpperCase()}\`
- **Project:** \`${c.project || 'DEFAULT'}\`
- **Priority:** \`${c.priority || 'Normal'}\`
- **Tags:** ${tagsStr}
`;
    }

    return `# 🏃 Sprint #${record.sprintNumber} Governance Audit & Completion Report

> **Session / Project:** \`${this.sessionId}\`  
> **Story Card:** **${record.story}**  
> **Committed Points:** **${record.storyPoints ?? 5} pts**  
> **Status:** ✅ **COMPLETED & ARCHIVED**

---

## 📌 Executive Summary
${record.summary}

## ⏱️ Timeline & Metrics
- **Sprint Started:** ${started.toISOString()} (\`${started.toLocaleString()}\`)
- **Sprint Completed:** ${completed.toISOString()} (\`${completed.toLocaleString()}\`)
- **Total Duration:** \`${duration}\`
- **Total Ceremonies Logged:** ${record.ceremoniesCount}
${cardBlock}
## 🏛️ Sprint Ceremony Governance Audit Trail

| # | Ceremony Name | Location / Room | Timestamp | Summary & Governance Notes |
|---|---|---|---|---|
${historyRows || '| - | *No ceremony events logged* | - | - | - |'}

## 👥 Department & Stakeholder Sign-Offs

- [x] **Product Department (PO / PM):** Acceptance criteria validated in Delta Room (Δ) & UAT Sign-off approved.
- [x] **Designer Department (UI/UX):** Design system fidelity and user interaction validated in Demo (λ).
- [x] **Tech Department (Frontend + Backend + QA):** Code reviewed, tests passing, zero regressions committed.
- [x] **DevOps & Platform (Release & SRE):** Production release deployed with automated canary verification in Omega Room (Ω).
- [x] **AI & Data Department:** Pipeline stability, prompt alignment, and data consistency verified.

---
*Report generated automatically by [Agent HQ](https://github.com/agent-hq/agent-team) • Claude Code Sprint Governance Engine*
`;
  }

  public getCompletedSprints(): SprintRecord[] {
    return [...this.completedSprints];
  }

  public getSprint(): SprintState {
    return { ...this.sprint };
  }

  public getAgent(name: string): Agent | undefined {
    return this.agents.get(name.toLowerCase());
  }
}


const STATE_DIR = path.join(os.homedir(), '.agent-team');
const STATE_FILE = process.env.AGENT_TEAM_STATE_FILE || path.join(STATE_DIR, 'sessions_state.json');

export class SessionManager {
  private sessions: Map<string, StateManager> = new Map();
  private defaultSessionId: string;
  private listeners: ((sessionId: string, state: ServerState, event?: any) => void)[] = [];
  private sessionListListeners: ((sessions: SessionSummary[]) => void)[] = [];
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.defaultSessionId = this.sanitizeSessionName(
      process.env.AGENT_TEAM_SESSION ||
      process.env.CLAUDE_PROJECT_DIR ||
      path.basename(process.cwd()) ||
      'agent_team'
    );
    this.loadFromDisk();
    this.getOrCreateSession(this.defaultSessionId);

    // Register process termination hooks for state flushing
    const flushOnExit = () => {
      this.saveToDisk();
    };
    process.once('SIGINT', flushOnExit);
    process.once('SIGTERM', flushOnExit);
    process.once('beforeExit', flushOnExit);
  }

  public scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveToDisk();
    }, 400);
  }

  public saveToDisk(): void {
    try {
      if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
      }
      const data: Record<string, any> = {
        version: 1,
        savedAt: Date.now(),
        defaultSessionId: this.defaultSessionId,
        sessions: {}
      };
      for (const [id, mgr] of this.sessions.entries()) {
        data.sessions[id] = mgr.serialize();
      }
      const tmpPath = `${STATE_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, STATE_FILE);
    } catch (err) {
      console.error('[SessionManager] Failed to persist state to disk:', err);
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(STATE_FILE)) return false;
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!data || !data.sessions) return false;

      for (const [id, sData] of Object.entries<any>(data.sessions)) {
        const cleanId = this.sanitizeSessionName(id);
        let mgr = this.sessions.get(cleanId);
        if (!mgr) {
          mgr = new StateManager(cleanId);
          this.sessions.set(cleanId, mgr);
          this.attachSessionListeners(cleanId, mgr);
        }
        mgr.deserialize(sData);
      }
      return true;
    } catch (err) {
      console.warn('[SessionManager] Could not load state from disk:', err);
      return false;
    }
  }

  private attachSessionListeners(id: string, manager: StateManager) {
    manager.subscribe((state, event) => {
      this.scheduleSave();
      for (const l of this.listeners) {
        try {
          l(id, state, event);
        } catch (err) {
          console.error(`[SessionManager] Error in listener for ${id}:`, err);
        }
      }
    });
  }

  public getDefaultSessionId(): string {
    return this.defaultSessionId;
  }

  public sanitizeSessionName(name?: string | null): string {
    if (!name) return this.defaultSessionId || 'default';
    const clean = String(name).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return clean || 'default';
  }

  public getOrCreateSession(rawId?: string | null): StateManager {
    const id = this.sanitizeSessionName(rawId || this.defaultSessionId);
    let manager = this.sessions.get(id);
    if (!manager) {
      manager = new StateManager(id);
      this.sessions.set(id, manager);
      this.attachSessionListeners(id, manager);
      this.notifySessionListChange();
      this.scheduleSave();
    }
    return manager;
  }

  public getSession(rawId: string): StateManager | undefined {
    const id = this.sanitizeSessionName(rawId);
    return this.sessions.get(id);
  }

  public hasSession(rawId: string): boolean {
    const id = this.sanitizeSessionName(rawId);
    return this.sessions.has(id);
  }

  public listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values())
      .map(m => m.getSummary())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public deleteSession(rawId: string): boolean {
    const id = this.sanitizeSessionName(rawId);
    if (this.sessions.size <= 1 && id === this.defaultSessionId) {
      this.sessions.get(id)?.reset();
      this.notifySessionListChange();
      this.scheduleSave();
      return true;
    }
    const existed = this.sessions.delete(id);
    if (existed) {
      this.notifySessionListChange();
      this.scheduleSave();
    }
    return existed;
  }

  public subscribe(listener: (sessionId: string, state: ServerState, event?: any) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public subscribeSessionList(listener: (sessions: SessionSummary[]) => void) {
    this.sessionListListeners.push(listener);
    return () => {
      this.sessionListListeners = this.sessionListListeners.filter(l => l !== listener);
    };
  }

  public notifySessionListChange() {
    const list = this.listSessions();
    for (const l of this.sessionListListeners) {
      try {
        l(list);
      } catch (err) {
        console.error('[SessionManager] Error in session list listener:', err);
      }
    }
  }
}

export const sessionManager = new SessionManager();
export const stateManager = sessionManager.getOrCreateSession();
