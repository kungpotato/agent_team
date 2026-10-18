import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { sessionManager, StateManager } from './state.js';
import { potatoAgentRegistry, getAllPotatoRoles } from './potato-agents.js';
import { cardManager } from './cards.js';
import { WSMessage, DEPARTMENTS, DepartmentId, Agent, MEETING_ROOMS, resolveRoomId } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');

interface SessionWebSocket extends WebSocket {
  currentSessionId?: string;
}

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(publicDir));

  // Multi-session resolution middleware
  app.use((req, res, next) => {
    const sessionQuery = (req.query.session || req.query.sessionId) as string | undefined;
    const sessionHeader = req.headers['x-session-id'] as string | undefined;
    const sessionBody = req.body && (req.body.session || req.body.sessionId);
    const rawId = sessionQuery || sessionHeader || sessionBody;
    const sessionId = sessionManager.sanitizeSessionName(rawId || sessionManager.getDefaultSessionId());
    (req as any).sessionId = sessionId;
    (req as any).stateManager = sessionManager.getOrCreateSession(sessionId);
    next();
  });

  // State changes subscription across all directory sessions
  sessionManager.subscribe((sessionId, state, event) => {
    const stateMsg = JSON.stringify({ type: 'STATE_UPDATE', session: sessionId, payload: state });
    const eventMsg = event ? JSON.stringify({ type: 'AGENT_EVENT', session: sessionId, payload: { event: event.type, agent: event.agent } }) : null;

    wss.clients.forEach((client: SessionWebSocket) => {
      if (client.readyState === WebSocket.OPEN && client.currentSessionId === sessionId) {
        client.send(stateMsg);
        if (eventMsg) {
          client.send(eventMsg);
        }
      }
    });
  });

  // Session list changes subscription
  sessionManager.subscribeSessionList((sessions) => {
    const msg = JSON.stringify({ type: 'SESSIONS_UPDATE', payload: sessions });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  });

  // WebSocket connection with session tracking
  wss.on('connection', (ws: SessionWebSocket, req) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const requestedSession = url.searchParams.get('session');
      const sessionId = sessionManager.sanitizeSessionName(requestedSession || sessionManager.getDefaultSessionId());
      ws.currentSessionId = sessionId;

      const sm = sessionManager.getOrCreateSession(sessionId);
      ws.send(JSON.stringify({
        type: 'INIT',
        session: sessionId,
        payload: sm.getState(),
        sessions: sessionManager.listSessions()
      }));
    } catch (e) {
      console.error('[WebSocket] Connection initialization error:', e);
    }

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'SUBSCRIBE_SESSION' || data.type === 'SWITCH_SESSION') {
          const nextSession = sessionManager.sanitizeSessionName(data.session);
          ws.currentSessionId = nextSession;
          const targetSm = sessionManager.getOrCreateSession(nextSession);
          ws.send(JSON.stringify({
            type: 'INIT',
            session: nextSession,
            payload: targetSm.getState(),
            sessions: sessionManager.listSessions()
          }));
        }
      } catch (err) {
        console.error('[WebSocket] Message handling error:', err);
      }
    });
  });

  // REST API: Health
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      defaultSession: sessionManager.getDefaultSessionId(),
      activeSessionsCount: sessionManager.listSessions().length
    });
  });

  // REST API: Sessions Management
  app.get('/api/sessions', (req, res) => {
    res.json({
      success: true,
      currentSession: (req as any).sessionId,
      sessions: sessionManager.listSessions()
    });
  });

  app.post('/api/sessions', (req, res) => {
    const name = req.body?.name || req.body?.session;
    if (!name) return res.status(400).json({ error: 'Session name is required' });
    const sm = sessionManager.getOrCreateSession(name);
    res.json({
      success: true,
      session: sm.sessionId,
      summary: sm.getSummary(),
      sessions: sessionManager.listSessions()
    });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const sm = sessionManager.getSession(req.params.id);
    if (!sm) return res.status(404).json({ error: `Session "${req.params.id}" not found` });
    res.json({
      success: true,
      session: sm.sessionId,
      summary: sm.getSummary(),
      state: sm.getState()
    });
  });

  app.post('/api/sessions/:id/reset', (req, res) => {
    const sm = sessionManager.getSession(req.params.id);
    if (!sm) return res.status(404).json({ error: `Session "${req.params.id}" not found` });
    const result = sm.reset();
    res.json({ success: true, session: sm.sessionId, count: result.count });
  });

  app.delete('/api/sessions/:id', (req, res) => {
    const success = sessionManager.deleteSession(req.params.id);
    res.json({ success, sessions: sessionManager.listSessions() });
  });

  // REST API: Agents
  app.get('/api/agents', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    res.json({ session: (req as any).sessionId, ...sm.getState() });
  });

  app.post('/api/agents/spawn', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { role = 'dev', name, status = 'working', message } = req.body;
    const target = name || role;
    const agent = sm.spawn(target, status, message);
    res.json({ success: true, session: sm.sessionId, agent });
  });

  app.post('/api/agents/work', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name, task, progress } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = sm.setWorking(name, task, progress !== undefined ? Number(progress) : undefined);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found in session ${sm.sessionId}` });
    res.json({ success: true, session: sm.sessionId, agent });
  });

  app.post('/api/agents/progress', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name, progress, task } = req.body;
    if (!name || progress === undefined) return res.status(400).json({ error: 'Name and progress are required' });
    const agent = sm.setProgress(name, Number(progress), task);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found in session ${sm.sessionId}` });
    res.json({ success: true, session: sm.sessionId, agent });
  });

  app.post('/api/agents/sleep', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = sm.setSleeping(name);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found in session ${sm.sessionId}` });
    res.json({ success: true, session: sm.sessionId, agent });
  });

  app.post('/api/agents/talk', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name, message = 'Hello!' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = sm.setTalking(name, message);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found in session ${sm.sessionId}` });
    res.json({ success: true, session: sm.sessionId, agent });
  });

  app.post('/api/agents/meet', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { names = [], topic, room, roomId, forceQueue } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Array of agent names is required' });
    }
    const targetRoom = resolveRoomId(room || roomId) || 1;
    const result = sm.startMeeting(names, topic, targetRoom, { autoQueueIfFull: forceQueue !== false });
    res.json({ success: true, session: sm.sessionId, ...result, topic, roomId: targetRoom });
  });

  app.post('/api/agents/end-meeting', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { names, room, roomId } = req.body;
    const targetRoom = resolveRoomId(room || roomId);
    const { removed, autoAdmitted } = sm.endMeeting({ roomId: targetRoom, names });
    res.json({ success: true, session: sm.sessionId, removed, autoAdmitted, roomId: targetRoom });
  });

  // Meeting Room Status & Reservation Queue Endpoints
  app.get('/api/meeting-rooms/status', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { roomId } = req.query;
    const rId = resolveRoomId(roomId as string);
    const rooms = sm.getRoomStatus(rId);
    const state = sm.getState();
    res.json({
      success: true,
      session: sm.sessionId,
      rooms,
      queue: state.meetingQueue,
      meetingRoomsInfo: Object.values(MEETING_ROOMS)
    });
  });

  app.post('/api/meeting-rooms/queue', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { names = [], topic, room, roomId } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Array of agent names is required' });
    }
    const targetRoom = resolveRoomId(room || roomId);
    const result = sm.enqueueMeeting(names, topic, targetRoom);
    res.json({ success: true, session: sm.sessionId, ...result });
  });

  app.post('/api/meeting-rooms/dequeue', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { id, name } = req.body;
    if (!id && !name) {
      return res.status(400).json({ error: 'Queue ID or agent name is required' });
    }
    const removed = sm.cancelQueue(id || name);
    res.json({ success: !!removed, session: sm.sessionId, removed });
  });

  // Desk Visit & Walk-to-Consult Endpoints
  app.post('/api/agents/visit', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { from, to, question, reply, duration } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" (visitor) and "to" (target) agent names are required' });
    }
    const durationSec = duration !== undefined ? Number(duration) : 12;
    const qText = question || 'Hey, do you have a minute to sync on this?';
    const result = sm.startVisit(from, to, qText, reply, durationSec);
    res.json({ success: true, session: sm.sessionId, ...result });
  });

  app.post('/api/agents/return', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name, visitor } = req.body;
    const targetName = name || visitor;
    if (!targetName) {
      return res.status(400).json({ error: 'Agent name is required to return from visit' });
    }
    const result = sm.returnVisit(targetName);
    res.json({ success: result.success, session: sm.sessionId });
  });

  app.get('/api/agents/visits', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    res.json({ success: true, session: sm.sessionId, visits: sm.getState().visits });
  });

  app.post('/api/agents/remove', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { name, names, idle, sleeping } = req.body;
    if (idle || sleeping || (Array.isArray(names) && names.length > 0)) {
      const removed = sm.removeFiltered({
        names: Array.isArray(names) ? names : (name ? [name] : undefined),
        idleOnly: !!idle,
        sleepingOnly: !!sleeping
      });
      return res.json({ success: true, session: sm.sessionId, count: removed.length, removed });
    }

    if (!name) return res.status(400).json({ error: 'Name, names, or filter (idle/sleeping) is required' });
    const agent = sm.remove(name);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found in session ${sm.sessionId}` });
    res.json({ success: true, session: sm.sessionId, count: 1, removed: [agent] });
  });

  app.post('/api/reset', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const result = sm.reset();
    res.json({ success: true, session: sm.sessionId, count: result.count });
  });

  app.get('/api/potato-agents', (req, res) => {
    res.json(Array.from(potatoAgentRegistry.values()));
  });

  app.post('/api/potato-agents/spawn-squad', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const roles = getAllPotatoRoles();
    const spawned: Agent[] = [];
    for (const role of roles) {
      const agent = sm.spawn(role);
      spawned.push(agent);
    }
    res.json({ success: true, session: sm.sessionId, count: spawned.length, agents: spawned });
  });

  app.get('/api/departments', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const state = sm.getState();
    const depts = Object.values(DEPARTMENTS).map(d => {
      const benchAgents = state.agents.filter(a => a.room === 'work' && a.slot >= d.benchIndex * 8 && a.slot < (d.benchIndex + 1) * 8);
      return {
        ...d,
        benchNumber: d.benchIndex + 1,
        occupancy: benchAgents.length,
        capacity: 8,
        agents: benchAgents
      };
    });
    res.json({ success: true, session: sm.sessionId, departments: depts });
  });

  app.post('/api/departments/spawn', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { department, count } = req.body || {};
    if (!department) return res.status(400).json({ error: 'department is required (product, designer, tech, devops, ai_data)' });
    const dept = DEPARTMENTS[department as DepartmentId];
    if (!dept) return res.status(400).json({ error: `Unknown department "${department}". Available: product, designer, tech, devops, ai_data` });

    const num = Math.min(Math.max(parseInt(count, 10) || 1, 1), 8);
    const spawned: Agent[] = [];
    for (let i = 0; i < num; i++) {
      const role = dept.roles[i % dept.roles.length];
      const agent = sm.spawn(role);
      spawned.push(agent);
    }
    res.json({ success: true, session: sm.sessionId, department: dept.name, count: spawned.length, agents: spawned });
  });

  app.get('/api/sprint', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    res.json({ success: true, session: sm.sessionId, sprint: sm.getSprint() });
  });

  app.post('/api/sprint/start', async (req, res) => {
    try {
      const sm: StateManager = (req as any).stateManager;
      const { sprintNumber, story, points, cardId, source } = req.body || {};
      const sprint = await sm.startSprint({
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        story,
        points: points ? Number(points) : undefined,
        cardId,
        source
      });
      res.json({ success: true, session: sm.sessionId, sprint });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/ceremony', (req, res) => {
    try {
      const sm: StateManager = (req as any).stateManager;
      const { phase, points, topic } = req.body || {};
      if (!phase) {
        return res.status(400).json({ error: 'phase is required (validation, grooming, planning, working, demo, retro or 1..8)' });
      }
      const result = sm.runCeremony(phase, {
        points: points ? Number(points) : undefined,
        topic
      });
      res.json({ success: true, session: sm.sessionId, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/next', (req, res) => {
    try {
      const sm: StateManager = (req as any).stateManager;
      const result = sm.nextCeremony();
      res.json({ success: true, session: sm.sessionId, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/complete', (req, res) => {
    try {
      const sm: StateManager = (req as any).stateManager;
      const { summary } = req.body || {};
      const result = sm.completeSprint(summary);
      res.json({ success: true, session: sm.sessionId, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/sprint/history', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    res.json({ success: true, session: sm.sessionId, completedSprints: sm.getCompletedSprints() });
  });

  // Story Cards API (Taskwarrior default, or Jira)
  app.get('/api/cards', async (req, res) => {
    try {
      const source = (req.query.source as any) || 'taskwarrior';
      const cards = await cardManager.getCards(source);
      res.json({ success: true, source, count: cards.length, cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/cards/:id', async (req, res) => {
    try {
      const source = (req.query.source as any) || 'taskwarrior';
      const card = await cardManager.getCard(req.params.id, source);
      if (!card) return res.status(404).json({ error: `Card ${req.params.id} not found in ${source}` });
      res.json({ success: true, card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/cards/add', async (req, res) => {
    try {
      const { title, points, tags, priority, source } = req.body || {};
      const card = await cardManager.addCard(title, {
        points: points ? Number(points) : undefined,
        tags: Array.isArray(tags) ? tags : (tags ? [tags] : undefined),
        source: source || 'taskwarrior'
      });
      res.json({ success: true, card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // REST API: Retro Slack-like Agent Threads & Smart Brevity Discussions
  app.get('/api/threads', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const category = req.query.category as any;
    const roomId = req.query.roomId ? Number(req.query.roomId) : undefined;
    res.json({ success: true, session: sm.sessionId, threads: sm.getThreads({ category, roomId }) });
  });

  app.post('/api/threads', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { title, category, roomId, sprintNumber, ceremonyPhase, author = 'lead', content, topic, intent, point, nextSteps, mentions } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const thread = sm.createThread({
      title,
      category,
      roomId: roomId ? Number(roomId) : undefined,
      sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
      ceremonyPhase,
      author,
      content,
      topic,
      intent,
      point,
      nextSteps,
      mentions
    });
    res.json({ success: true, session: sm.sessionId, thread });
  });

  app.get('/api/threads/:id', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const thread = sm.getThread(req.params.id);
    if (!thread) return res.status(404).json({ error: `Thread "${req.params.id}" not found` });
    res.json({ success: true, session: sm.sessionId, thread });
  });

  app.post('/api/threads/:id/messages', (req, res) => {
    const sm: StateManager = (req as any).stateManager;
    const { author = 'lead', content, topic, intent, point, nextSteps, mentions } = req.body || {};
    try {
      const result = sm.postThreadMessage(req.params.id, {
        author,
        content,
        topic,
        intent,
        point,
        nextSteps,
        mentions
      });
      res.json({ success: true, session: sm.sessionId, message: result.message, thread: result.thread });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Session-scoped Thread Endpoints
  app.get('/api/sessions/:id/threads', (req, res) => {
    const sm = sessionManager.getSession(req.params.id);
    if (!sm) return res.status(404).json({ error: `Session "${req.params.id}" not found` });
    const category = req.query.category as any;
    const roomId = req.query.roomId ? Number(req.query.roomId) : undefined;
    res.json({ success: true, session: sm.sessionId, threads: sm.getThreads({ category, roomId }) });
  });

  app.get('/api/sessions/:id/threads/:threadId', (req, res) => {
    const sm = sessionManager.getSession(req.params.id);
    if (!sm) return res.status(404).json({ error: `Session "${req.params.id}" not found` });
    const thread = sm.getThread(req.params.threadId);
    if (!thread) return res.status(404).json({ error: `Thread "${req.params.threadId}" not found` });
    res.json({ success: true, session: sm.sessionId, thread });
  });

  app.post('/api/sessions/:id/threads/:threadId/messages', (req, res) => {
    const sm = sessionManager.getSession(req.params.id);
    if (!sm) return res.status(404).json({ error: `Session "${req.params.id}" not found` });
    const { author = 'lead', content, topic, intent, point, nextSteps, mentions } = req.body || {};
    try {
      const result = sm.postThreadMessage(req.params.threadId, {
        author,
        content,
        topic,
        intent,
        point,
        nextSteps,
        mentions
      });
      res.json({ success: true, session: sm.sessionId, message: result.message, thread: result.thread });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  return { app, server };
}

export function startServer(port: number = 3333): Promise<http.Server> {
  const { server } = createServer();
  return new Promise(resolve => {
    server.listen(port, () => {
      console.log(`🎮 Agent Team 8-Bit Web Server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}
