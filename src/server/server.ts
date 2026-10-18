import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { stateManager } from './state.js';
import { potatoAgentRegistry } from './potato-agents.js';
import { WSMessage } from './types.js';

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
    const agents = stateManager.spawnPotatoSquad();
    res.json({ success: true, count: agents.length, agents });
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
