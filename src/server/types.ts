export type AgentStatus = 'working' | 'sleeping' | 'talking' | 'waiting' | 'walking' | 'visiting';
export type RoomType = 'work' | 'meeting';

export interface VisitSession {
  id: string; // e.g., "V-101"
  visitorName: string; // the agent walking over to ask
  targetName: string; // the agent being visited
  question: string; // question or information asked
  reply?: string; // response from the visited agent
  startedAt: number;
  durationSec: number; // seconds to stay before returning (0 = stay indefinitely)
  phase: 'walking' | 'talking' | 'returning' | 'completed';
}

export interface Agent {
  id: string; // e.g., "dev1"
  name: string; // display name e.g., "dev1"
  role: string; // base role e.g., "coder"
  roleTitle?: string; // e.g. "CODER", "ARCHITECT", "REVIEWER"
  status: AgentStatus;
  room: RoomType;
  meetingRoomId?: number; // 1 to 5 for meeting rooms
  slot: number; // desk slot index in work room or chair index in meeting room
  department?: DepartmentId; // 'product' | 'designer' | 'tech' | 'devops' | 'ai_data'
  message?: string; // speech bubble message or task description
  progress?: number; // 0 to 100 percentage for working tasks
  color?: string; // color name e.g. "orange", "blue"
  colorIndex: number; // 0..N for distinct pixel palettes
  updatedAt: number;
  currentVisit?: {
    partnerName: string;
    isVisitor: boolean;
    question: string;
    reply?: string;
  };
}

export type DepartmentId = 'product' | 'designer' | 'tech' | 'devops' | 'ai_data';

export interface DepartmentInfo {
  id: DepartmentId;
  name: string;
  benchIndex: number; // 0 to 4 (Bench 1 to 5)
  color: string;
  description: string;
  roles: string[];
}

export const DEPARTMENTS: Record<DepartmentId, DepartmentInfo> = {
  product: {
    id: 'product',
    name: 'PRODUCT',
    benchIndex: 0,
    color: '#8a2be2',
    description: 'Product Managers, Project Planners, Product Owners, and Scrum Masters',
    roles: ['product-manager', 'project-planner', 'product-owner', 'scrum-master', 'product', 'pm', 'planner', 'po']
  },
  designer: {
    id: 'designer',
    name: 'DESIGNER',
    benchIndex: 1,
    color: '#ff1493',
    description: 'UI/UX Designers and Design-to-Code Specialists',
    roles: ['ui-ux-designer', 'design-to-code', 'designer', 'ui', 'ux']
  },
  tech: {
    id: 'tech',
    name: 'TECH (FRONTEND + BACKEND + QA)',
    benchIndex: 2,
    color: '#38bdf8',
    description: 'System Architects, Coders, Code Reviewers, and QA Testers',
    roles: ['system-architect', 'coder', 'code-reviewer', 'qa-tester', 'dev', 'frontend', 'backend', 'qa', 'tech']
  },
  devops: {
    id: 'devops',
    name: 'DEVOPS',
    benchIndex: 3,
    color: '#00ffff',
    description: 'DevOps Release Engineers, Infrastructure SRE, and Platform Engineers',
    roles: ['devops-release', 'devops-engineer', 'runtime-sre', 'devops', 'sre', 'infra', 'platform']
  },
  ai_data: {
    id: 'ai_data',
    name: 'AI & DATA',
    benchIndex: 4,
    color: '#a855f7',
    description: 'AI & Data Engineers, RAG/LLM Pipeline Specialists',
    roles: ['ai-engineer', 'ai', 'data', 'ml']
  }
};

export function resolveDepartmentByRole(role: string): DepartmentInfo {
  const r = role.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (r.includes('product') || r.includes('plan') || r === 'pm' || r === 'po' || r.includes('scrum') || r === 'ba') {
    return DEPARTMENTS.product;
  }
  if (r.includes('design') || r.includes('ui') || r.includes('ux') || r.includes('art')) {
    return DEPARTMENTS.designer;
  }
  if (r.includes('devops') || r.includes('sre') || r.includes('infra') || r.includes('platform') || r.includes('release') || r.includes('cloud')) {
    return DEPARTMENTS.devops;
  }
  if (r.includes('ai') || r.includes('data') || r.includes('ml') || r.includes('model') || r.includes('analyst')) {
    return DEPARTMENTS.ai_data;
  }
  // Default to tech (coder, backend, frontend, qa, dev, architect, reviewer)
  return DEPARTMENTS.tech;
}

export interface MeetingQueueItem {
  id: string; // e.g., "Q-1"
  names: string[];
  topic: string;
  targetRoomId?: number; // 1 to 5, or undefined for any room
  queuedAt: number;
}

export interface RoomStatusInfo {
  roomId: number;
  name: string;
  occupancy: number;
  capacity: number;
  isFull: boolean;
  isOccupied: boolean;
  topic?: string;
  attendees: string[];
}

export type SprintPhase = 'idle' | 'validation' | 'grooming' | 'planning' | 'working' | 'demo' | 'uat' | 'release' | 'retro' | 'completed';

export interface SprintCeremonyInfo {
  phase: SprintPhase;
  phaseIndex: number; // 1 to 8
  name: string;
  shortName: string;
  description: string;
  room?: number;
  attendees: string[];
  topic: string;
  startedAt: number;
}

export type CardSourceProvider = 'taskwarrior' | 'jira';

export interface StoryCard {
  id: string; // e.g. "1" or "AUTH-101"
  title: string;
  description?: string;
  points?: number;
  status: 'todo' | 'in_progress' | 'done';
  source: CardSourceProvider;
  project?: string;
  priority?: string;
  tags?: string[];
}

export interface SprintRecord {
  sprintNumber: number;
  story: string;
  storyPoints?: number;
  startedAt: number;
  completedAt: number;
  ceremoniesCount: number;
  summary?: string;
  sourceCard?: StoryCard;
}

export interface SprintState {
  sprintNumber: number;
  story: string;
  storyPoints?: number;
  phase: SprintPhase;
  phaseIndex: number; // 0 to 8 (0 = idle, 9 = completed)
  startedAt: number;
  completedAt?: number;
  activeCeremony?: SprintCeremonyInfo;
  sourceCard?: StoryCard;
  history: {
    phase: SprintPhase;
    timestamp: number;
    summary: string;
  }[];
  completedSprints?: SprintRecord[];
}

export interface SessionSummary {
  id: string; // Session ID / project dir name (e.g. 'agent_team', 'mobile-app')
  name: string; // Display name
  projectDir?: string;
  agentCount: number;
  workingCount: number;
  meetingCount: number;
  sprintNumber: number;
  sprintPhase: SprintPhase;
  story: string;
  storyPoints?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServerState {
  agents: Agent[];
  meetingTopics: Record<number, string>; // room 1..5 -> topic
  meetingQueue: MeetingQueueItem[];
  visits: VisitSession[];
  sprint: SprintState;
  session?: string;
}

export type WSMessage =
  | { type: 'INIT'; session?: string; payload: ServerState; sessions?: SessionSummary[] }
  | { type: 'STATE_UPDATE'; session?: string; payload: ServerState }
  | { type: 'AGENT_EVENT'; session?: string; payload: { event: 'spawn' | 'sleep' | 'work' | 'talk' | 'wait' | 'walk' | 'disappear'; agent: Agent } }
  | { type: 'SPRINT_UPDATE'; session?: string; payload: SprintState }
  | { type: 'SESSIONS_UPDATE'; payload: SessionSummary[] };

export interface MeetingRoomInfo {
  id: number; // 1 to 5
  name: string; // e.g. "Sigma (Σ)"
  symbol: string; // e.g. "Σ"
  fullName: string; // e.g. "Sigma Room (Σ)"
  subtitle: string;
  domain: 'math' | 'physics';
  concept: string; // e.g. "Summation & Statistical Physics"
  primaryCeremony?: string; // e.g. "2. Backlog Grooming"
}

export const MEETING_ROOMS: Record<number, MeetingRoomInfo> = {
  1: {
    id: 1,
    name: 'Sigma (Σ)',
    symbol: 'Σ',
    fullName: 'Sigma Room (Σ)',
    subtitle: 'Math: Summation / Physics: Pauli Spin Matrix',
    domain: 'math',
    concept: 'Summation & Statistical Physics',
    primaryCeremony: '2. Backlog Grooming & Point Estimation'
  },
  2: {
    id: 2,
    name: 'Delta (Δ)',
    symbol: 'Δ',
    fullName: 'Delta Room (Δ)',
    subtitle: 'Math: Differential & Laplacian / Physics: Uncertainty Principle',
    domain: 'physics',
    concept: 'Rate of Change & Quantum Variance',
    primaryCeremony: '1. Story Validation & 6. UAT Sign-Off'
  },
  3: {
    id: 3,
    name: 'Lambda (λ)',
    symbol: 'λ',
    fullName: 'Lambda Room (λ)',
    subtitle: 'Math: Lambda Calculus & Eigenvalues / Physics: Wavelength',
    domain: 'math',
    concept: 'Functional Computation & Wave Dynamics',
    primaryCeremony: '5. Sprint Feature Demo'
  },
  4: {
    id: 4,
    name: 'Omega (Ω)',
    symbol: 'Ω',
    fullName: 'Omega Room (Ω)',
    subtitle: 'Physics: Electrical Resistance (Ohm) & Cosmology / Math: Asymptotics',
    domain: 'physics',
    concept: 'Ohmic Resistance & Ultimate State',
    primaryCeremony: '7. Production Release & Canary Rollout'
  },
  5: {
    id: 5,
    name: 'Infinity (∞)',
    symbol: '∞',
    fullName: 'Infinity Boardroom (∞)',
    subtitle: 'Math: Infinity / Physics: Infinite Space-Time & Renormalization',
    domain: 'math',
    concept: 'Infinite Scalability & Synergy',
    primaryCeremony: '3. Sprint Planning & 8. Retrospective'
  }
};

export function resolveRoomId(input: string | number | undefined | null): number | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === 'number') {
    return input >= 1 && input <= 5 ? input : undefined;
  }
  const clean = input.trim().toLowerCase();
  if (/^[1-5]$/.test(clean)) {
    return parseInt(clean, 10);
  }
  if (clean.includes('sigma') || clean === 'σ' || clean === 'Σ') return 1;
  if (clean.includes('delta') || clean === 'δ' || clean === 'Δ') return 2;
  if (clean.includes('lambda') || clean === 'λ' || clean === 'Λ') return 3;
  if (clean.includes('omega') || clean === 'ω' || clean === 'Ω') return 4;
  if (clean.includes('infinity') || clean === '∞' || clean.includes('boardroom') || clean === 'board') return 5;
  return undefined;
}



