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

export interface ServerState {
  agents: Agent[];
  meetingTopics: Record<number, string>; // room 1..5 -> topic
  meetingQueue: MeetingQueueItem[];
  visits: VisitSession[];
  sprint: SprintState;
}

export type WSMessage =
  | { type: 'INIT'; payload: ServerState }
  | { type: 'STATE_UPDATE'; payload: ServerState }
  | { type: 'AGENT_EVENT'; payload: { event: 'spawn' | 'sleep' | 'work' | 'talk' | 'wait' | 'walk' | 'disappear'; agent: Agent } }
  | { type: 'SPRINT_UPDATE'; payload: SprintState };


