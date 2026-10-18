import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { stateManager } from './state.js';
import { potatoAgentRegistry, getAllPotatoRoles } from './potato-agents.js';
import { cardManager } from './cards.js';
import { WSMessage, DEPARTMENTS, DepartmentId, Agent } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(publicDir));

  // Broadcast helper
  const broadcast = (message: WSMessage) => {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  // State changes subscription
  stateManager.subscribe((state, event) => {
    broadcast({ type: 'STATE_UPDATE', payload: state });
    if (event) {
      broadcast({ type: 'AGENT_EVENT', payload: { event: event.type, agent: event.agent } });
    }
  });

  // WebSocket connection
  wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'INIT', payload: stateManager.getState() }));
  });

  // REST API
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/api/agents', (req, res) => {
    res.json(stateManager.getState());
  });

  app.post('/api/agents/spawn', (req, res) => {
    const { role = 'dev', name, status = 'working', message } = req.body;
    const target = name || role;
    const agent = stateManager.spawn(target, status, message);
    res.json({ success: true, agent });
  });

  app.post('/api/agents/work', (req, res) => {
    const { name, task, progress } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = stateManager.setWorking(name, task, progress !== undefined ? Number(progress) : undefined);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found` });
    res.json({ success: true, agent });
  });

  app.post('/api/agents/progress', (req, res) => {
    const { name, progress, task } = req.body;
    if (!name || progress === undefined) return res.status(400).json({ error: 'Name and progress are required' });
    const agent = stateManager.setProgress(name, Number(progress), task);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found` });
    res.json({ success: true, agent });
  });

  app.post('/api/agents/sleep', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = stateManager.setSleeping(name);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found` });
    res.json({ success: true, agent });
  });

  app.post('/api/agents/talk', (req, res) => {
    const { name, message = 'Hello!' } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const agent = stateManager.setTalking(name, message);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found` });
    res.json({ success: true, agent });
  });

  app.post('/api/agents/meet', (req, res) => {
    const { names = [], topic, room, roomId, forceQueue } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Array of agent names is required' });
    }
    const targetRoom = Number(room || roomId || 1);
    const result = stateManager.startMeeting(names, topic, targetRoom, { autoQueueIfFull: forceQueue !== false });
    res.json({ success: true, ...result, topic, roomId: targetRoom });
  });

  app.post('/api/agents/end-meeting', (req, res) => {
    const { names, room, roomId } = req.body;
    const targetRoom = room || roomId ? Number(room || roomId) : undefined;
    const { removed, autoAdmitted } = stateManager.endMeeting({ roomId: targetRoom, names });
    res.json({ success: true, removed, autoAdmitted, roomId: targetRoom });
  });

  // Meeting Room Status & Reservation Queue Endpoints
  app.get('/api/meeting-rooms/status', (req, res) => {
    const { roomId } = req.query;
    const rId = roomId ? Number(roomId) : undefined;
    const rooms = stateManager.getRoomStatus(rId);
    const state = stateManager.getState();
    res.json({
      success: true,
      rooms,
      queue: state.meetingQueue
    });
  });

  app.post('/api/meeting-rooms/queue', (req, res) => {
    const { names = [], topic, room, roomId } = req.body;
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'Array of agent names is required' });
    }
    const targetRoom = room || roomId ? Number(room || roomId) : undefined;
    const result = stateManager.enqueueMeeting(names, topic, targetRoom);
    res.json({ success: true, ...result });
  });

  app.post('/api/meeting-rooms/dequeue', (req, res) => {
    const { id, name } = req.body;
    if (!id && !name) {
      return res.status(400).json({ error: 'Queue ID or agent name is required' });
    }
    const removed = stateManager.cancelQueue(id || name);
    res.json({ success: !!removed, removed });
  });

  // Desk Visit & Walk-to-Consult Endpoints
  app.post('/api/agents/visit', (req, res) => {
    const { from, to, question, reply, duration } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" (visitor) and "to" (target) agent names are required' });
    }
    const durationSec = duration !== undefined ? Number(duration) : 12;
    const qText = question || 'Hey, do you have a minute to sync on this?';
    const result = stateManager.startVisit(from, to, qText, reply, durationSec);
    res.json({ success: true, ...result });
  });

  app.post('/api/agents/return', (req, res) => {
    const { name, visitor } = req.body;
    const targetName = name || visitor;
    if (!targetName) {
      return res.status(400).json({ error: 'Agent name is required to return from visit' });
    }
    const result = stateManager.returnVisit(targetName);
    res.json({ success: result.success });
  });

  app.get('/api/agents/visits', (req, res) => {
    res.json({ success: true, visits: stateManager.getState().visits });
  });



  app.post('/api/agents/remove', (req, res) => {
    const { name, names, idle, sleeping } = req.body;
    if (idle || sleeping || (Array.isArray(names) && names.length > 0)) {
      const removed = stateManager.removeFiltered({
        names: Array.isArray(names) ? names : (name ? [name] : undefined),
        idleOnly: !!idle,
        sleepingOnly: !!sleeping
      });
      return res.json({ success: true, count: removed.length, removed });
    }

    if (!name) return res.status(400).json({ error: 'Name, names, or filter (idle/sleeping) is required' });
    const agent = stateManager.remove(name);
    if (!agent) return res.status(404).json({ error: `Agent ${name} not found` });
    res.json({ success: true, count: 1, removed: [agent] });
  });

  app.post('/api/reset', (req, res) => {
    const result = stateManager.reset();
    res.json({ success: true, count: result.count });
  });

  app.get('/api/potato-agents', (req, res) => {
    res.json(Array.from(potatoAgentRegistry.values()));
  });

  app.post('/api/potato-agents/spawn-squad', (req, res) => {
    const roles = getAllPotatoRoles();
    const spawned: Agent[] = [];
    for (const role of roles) {
      const agent = stateManager.spawn(role);
      spawned.push(agent);
    }
    res.json({ success: true, count: spawned.length, agents: spawned });
  });

  app.get('/api/departments', (req, res) => {
    const state = stateManager.getState();
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
    res.json({ success: true, departments: depts });
  });

  app.post('/api/departments/spawn', (req, res) => {
    const { department, count } = req.body || {};
    if (!department) return res.status(400).json({ error: 'department is required (product, designer, tech, devops, ai_data)' });
    const dept = DEPARTMENTS[department as DepartmentId];
    if (!dept) return res.status(400).json({ error: `Unknown department "${department}". Available: product, designer, tech, devops, ai_data` });

    const num = Math.min(Math.max(parseInt(count, 10) || 1, 1), 8);
    const spawned: Agent[] = [];
    for (let i = 0; i < num; i++) {
      const role = dept.roles[i % dept.roles.length];
      const agent = stateManager.spawn(role);
      spawned.push(agent);
    }
    res.json({ success: true, department: dept.name, count: spawned.length, agents: spawned });
  });

  app.get('/api/sprint', (req, res) => {
    res.json({ success: true, sprint: stateManager.getSprint() });
  });

  app.post('/api/sprint/start', async (req, res) => {
    try {
      const { sprintNumber, story, points, cardId, source } = req.body || {};
      const sprint = await stateManager.startSprint({
        sprintNumber: sprintNumber ? Number(sprintNumber) : undefined,
        story,
        points: points ? Number(points) : undefined,
        cardId,
        source
      });
      res.json({ success: true, sprint });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/ceremony', (req, res) => {
    try {
      const { phase, points, topic } = req.body || {};
      if (!phase) {
        return res.status(400).json({ error: 'phase is required (validation, grooming, planning, working, demo, retro or 1..6)' });
      }
      const result = stateManager.runCeremony(phase, {
        points: points ? Number(points) : undefined,
        topic
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/next', (req, res) => {
    try {
      const result = stateManager.nextCeremony();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/sprint/complete', (req, res) => {
    try {
      const { summary } = req.body || {};
      const result = stateManager.completeSprint(summary);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/sprint/history', (req, res) => {
    res.json({ success: true, completedSprints: stateManager.getCompletedSprints() });
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
