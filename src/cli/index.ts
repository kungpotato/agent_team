import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startServer } from '../server/server.js';
import { resolveRoomId, MEETING_ROOMS } from '../server/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = parseInt(process.env.AGENT_TEAM_PORT || '3333', 10);

function getBaseUrl(port: number = DEFAULT_PORT) {
  return `http://localhost:${port}`;
}

async function isServerRunning(port: number = DEFAULT_PORT): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl(port)}/api/health`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(port: number = DEFAULT_PORT): Promise<void> {
  const running = await isServerRunning(port);
  if (running) return;

  console.log(`[agent-team] Server is not running on port ${port}. Starting background daemon...`);
  const serverPath = path.resolve(__dirname, '../../src/server/standalone.ts');
  const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx');

  // Launch detached background process
  const outLog = fs.openSync('/tmp/agent-team.log', 'a');
  const errLog = fs.openSync('/tmp/agent-team.err.log', 'a');

  const child = spawn(process.execPath, [tsxBin, serverPath, String(port)], {
    detached: true,
    stdio: ['ignore', outLog, errLog],
    env: { ...process.env, AGENT_TEAM_PORT: String(port) }
  });
  child.unref();

  // Wait up to 3 seconds for it to boot
  const start = Date.now();
  while (Date.now() - start < 3500) {
    await new Promise(r => setTimeout(r, 200));
    if (await isServerRunning(port)) {
      console.log(`[agent-team] Server started at ${getBaseUrl(port)}`);
      return;
    }
  }
  console.warn(`[agent-team] Warning: Server launch initiated, but port ${port} is not yet responding. Check /tmp/agent-team.err.log`);
}

import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.agent-team');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function getPersistentSession(): string | undefined {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return data.activeSession;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function setPersistentSession(session?: string): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    let data: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {
        data = {};
      }
    }
    if (session) {
      data.activeSession = session;
    } else {
      delete data.activeSession;
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to update session config:', err);
  }
}

function resolveSession(sessionArg?: string): string {
  if (sessionArg && typeof sessionArg === 'string' && sessionArg.trim()) {
    return sessionArg.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }
  const envSession = process.env.AGENT_TEAM_SESSION || process.env.CLAUDE_PROJECT_DIR;
  if (envSession && envSession.trim()) {
    return envSession.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }
  const persistent = getPersistentSession();
  if (persistent && persistent.trim()) {
    return persistent.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }
  const dirName = path.basename(process.cwd());
  return dirName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default';
}

async function apiCall(endpoint: string, method: string = 'GET', body?: any, port: number = DEFAULT_PORT, session?: string): Promise<any> {
  await ensureServer(port);
  const targetSession = session || (program.opts ? program.opts().session : undefined);
  const resolvedSession = resolveSession(targetSession);
  const base = getBaseUrl(port);
  const url = new URL(`${base}${endpoint}`);
  if (!url.searchParams.has('session')) {
    url.searchParams.set('session', resolvedSession);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': resolvedSession
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

const program = new Command();

program
  .name('agent-team')
  .description('8-Bit Pixel Art Office CLI for AI Agents')
  .version('1.0.0')
  .option('-S, --session <name>', 'Project directory session name (defaults to current directory name)');

// START COMMAND
program
  .command('start')
  .description('Start the 8-bit web server')
  .option('-p, --port <number>', 'Port number', String(DEFAULT_PORT))
  .option('--open', 'Open browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const running = await isServerRunning(port);
    if (running) {
      console.log(`🎮 Server is already running at ${getBaseUrl(port)}`);
    } else {
      await startServer(port);
    }
    if (options.open) {
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(openCmd, [getBaseUrl(port)], { detached: true, stdio: 'ignore' }).unref();
    }
  });

// SPAWN COMMAND
program
  .command('spawn <roleOrName>')
  .description('Spawn an agent (e.g. "dev" -> creates dev1, dev2, etc.)')
  .option('-n, --count <number>', 'Number of agents to spawn', '1')
  .option('-s, --status <status>', 'Initial status: working | sleeping | talking', 'working')
  .option('-m, --message <message>', 'Initial speech or task message')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (roleOrName, options) => {
    try {
      const port = parseInt(options.port, 10);
      const count = parseInt(options.count, 10) || 1;
      for (let i = 0; i < count; i++) {
        const res = await apiCall('/api/agents/spawn', 'POST', {
          role: roleOrName,
          status: options.status,
          message: options.message
        }, port);
        const deskNum = Math.floor(res.agent.slot / 8) + 1;
        const seatNum = (res.agent.slot % 8) + 1;
        console.log(`✨ Agent spawned: [${res.agent.name}] (${res.agent.status}) -> Desk ${deskNum} (Seat ${seatNum})`);
      }
    } catch (err: any) {
      console.error(`❌ Failed to spawn: ${err.message}`);
    }
  });

// WORK COMMAND
program
  .command('work <name> [task...]')
  .description('Set agent to working state (typing on laptop at desk)')
  .option('-P, --progress <number>', 'Task progress percentage (0-100)', '25')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, taskParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const task = taskParts && taskParts.length > 0 ? taskParts.join(' ') : 'Coding...';
      const progress = parseInt(options.progress, 10) || 25;
      const res = await apiCall('/api/agents/work', 'POST', { name, task, progress }, port);
      console.log(`💻 Agent [${res.agent.name}] is now WORKING (${res.agent.progress}%): "${task}"`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// PROGRESS COMMAND
program
  .command('progress <name> <percentage> [task...]')
  .description('Update agent work progress (0-100) and optional task message')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, percentage, taskParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const prog = parseInt(percentage, 10);
      const task = taskParts && taskParts.length > 0 ? taskParts.join(' ') : undefined;
      const res = await apiCall('/api/agents/progress', 'POST', { name, progress: prog, task }, port);
      console.log(`📈 Agent [${res.agent.name}] PROGRESS updated to ${res.agent.progress}%: "${res.agent.message}"`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// SLEEP COMMAND
program
  .command('sleep <name>')
  .description('Put an agent to sleep (resting/nap animation Zzz)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/agents/sleep', 'POST', { name }, port);
      console.log(`💤 Agent [${res.agent.name}] is now SLEEPING: "Zzz..."`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// TALK COMMAND
program
  .command('talk <name> <message...>')
  .description('Make an agent talk with a speech bubble')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, messageParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const message = messageParts.join(' ');
      const res = await apiCall('/api/agents/talk', 'POST', { name, message }, port);
      console.log(`💬 Agent [${res.agent.name}] says: "${message}"`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// ASK / VISIT COMMAND (Walk to another desk for consultation & Smart Brevity thread)
program
  .command('ask <from> <to> [question...]')
  .alias('visit')
  .alias('consult')
  .alias('walk-to')
  .alias('talk-to')
  .description('Send an agent walking over to another agent\'s desk to ask information or consult (creates Slack thread)')
  .option('-t, --topic <topic>', 'Specific topic / headline')
  .option('-i, --intent <text>', 'Why It Matters (1-2 sentences)')
  .option('-n, --next <text>', 'Next Steps / Ask')
  .option('-r, --reply <reply>', 'Explicit answer/reply from the target agent')
  .option('-d, --duration <seconds>', 'Duration of consultation before returning (default: 14)', '14')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (from, to, questionParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const question = questionParts && questionParts.length > 0
        ? questionParts.join(' ')
        : 'Hey, do you have a minute to sync on this?';
      const duration = parseInt(options.duration, 10) || 14;

      const res = await apiCall('/api/agents/ask', 'POST', {
        from,
        to,
        question,
        topic: options.topic,
        intent: options.intent,
        nextSteps: options.next,
        reply: options.reply,
        duration
      }, port);

      const targetDesk = Math.floor(res.target.slot / 8) + 1;
      const targetSeat = (res.target.slot % 8) + 1;

      console.log(`\n🤝 CONSULTATION OPENED: @${res.visitor.name} ➔ @${res.target.name} (Desk ${targetDesk}, Seat ${targetSeat})`);
      console.log(`📌 Thread: [${res.thread.id}] "${res.thread.title}"`);
      console.log(`❓ Question: "${question}"`);
      if (res.reply) {
        console.log(`💡 Reply: "${res.reply}"`);
      }
      console.log(`⏱️ Duration: ${duration}s walking animation | Logged in Slack feed with Smart Brevity.\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// RETURN COMMAND (Walk back to home desk)
program
  .command('return <visitorName>')
  .alias('back-to-desk')
  .alias('return-to-desk')
  .description('Call a visiting agent back to their home desk')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (visitorName, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/agents/return', 'POST', { name: visitorName }, port);
      if (res.success) {
        console.log(`🚶 Agent [${visitorName}] is walking back to their home desk!`);
      } else {
        console.log(`⚠️ Agent [${visitorName}] is not currently on a desk visit.`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });


// ROOM-STATUS COMMAND
program
  .command('room-status [roomNumber]')
  .alias('meet-status')
  .alias('rooms')
  .alias('status')
  .description('Check real-time meeting room occupancy (Rooms 1-5: Sigma, Delta, Lambda, Omega, Infinity) and waiting queue')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (roomNumber, options) => {
    try {
      const port = parseInt(options.port, 10);
      const resolvedRoom = resolveRoomId(roomNumber);
      const query = resolvedRoom ? `?roomId=${resolvedRoom}` : '';
      const data = await apiCall(`/api/meeting-rooms/status${query}`, 'GET', undefined, port);

      console.log('\n🏛️ CONFERENCE ROOMS (MATH & PHYSICS: Σ, Δ, λ, Ω, ∞ — Capacity: 8 seats/room)');
      console.log('═'.repeat(96));
      console.log(`${'ROOM'.padEnd(6)} | ${'NAME & SYMBOL'.padEnd(25)} | ${'STATUS'.padEnd(14)} | ${'SEATS'.padEnd(7)} | TOPIC / ATTENDEES`);
      console.log('─'.repeat(96));

      for (const r of data.rooms) {
        let statusBadge = '🟢 AVAILABLE';
        if (r.isFull) {
          statusBadge = '🔴 FULL (8/8)';
        } else if (r.isOccupied) {
          statusBadge = '🟡 IN USE';
        }
        const seatStr = `[${r.occupancy}/8]`;
        const topicStr = r.topic ? `"${r.topic}"` : '(None)';
        const attendeesStr = r.attendees.length > 0 ? ` -> [${r.attendees.join(', ')}]` : '';
        const roomLabel = `RM ${r.roomId}`;

        console.log(`${roomLabel.padEnd(6)} | ${r.name.padEnd(25)} | ${statusBadge.padEnd(14)} | ${seatStr.padEnd(7)} | ${topicStr}${attendeesStr}`);
      }
      console.log('═'.repeat(96));

      if (data.queue && data.queue.length > 0) {
        console.log(`\n⏳ MEETING WAITING QUEUE (${data.queue.length} meeting request${data.queue.length > 1 ? 's' : ''} waiting):`);
        console.log('─'.repeat(96));
        data.queue.forEach((q: any, idx: number) => {
          const roomTarget = q.targetRoomId ? (MEETING_ROOMS[q.targetRoomId]?.fullName || `Room ${q.targetRoomId}`) : 'First Free Room';
          const waitMins = Math.round((Date.now() - q.queuedAt) / 1000 / 60);
          const timeStr = waitMins === 0 ? 'just now' : `${waitMins}m ago`;
          console.log(`  #${idx + 1} [${q.id}] Target: ${roomTarget.padEnd(25)} | Topic: "${q.topic}"`);
          console.log(`     Waiting Agents: [${q.names.join(', ')}] (Queued: ${timeStr})`);
        });
        console.log('─'.repeat(96));
        console.log('💡 Note: When a room is freed (via "agent-team end-meeting <room>"), the next waiting team is automatically admitted!\n');
      } else {
        console.log('\n⏳ Waiting Queue: (No meetings currently waiting in queue)\n');
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// MEET COMMAND
program
  .command('meet <names...>')
  .description('Move agents to a meeting room (1-5: Sigma, Delta, Lambda, Omega, Infinity). If full, automatically queues request.')
  .option('-r, --room <room>', 'Meeting room: 1-5, or symbol/name (sigma, delta, lambda, omega, infinity, Σ, Δ, λ, Ω, ∞)', '1')
  .option('-t, --topic <topic>', 'Meeting topic/agenda')
  .option('--no-queue', 'Do not place in queue if full, abort instead')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (names, options) => {
    try {
      const port = parseInt(options.port, 10);
      const room = resolveRoomId(options.room) || 1;
      const roomInfo = MEETING_ROOMS[room];
      const roomName = roomInfo ? roomInfo.fullName : `Room ${room}`;
      const forceQueue = options.queue !== false;
      const res = await apiCall('/api/agents/meet', 'POST', { names, topic: options.topic, room, forceQueue }, port);

      if (res.queued) {
        console.log(`\n⚠️  [${roomName}] is currently FULL (8/8 seats occupied)!`);
        console.log(`⏳ Agents [${names.join(', ')}] placed in WAITING QUEUE:`);
        console.log(`   - Queue ID: ${res.queueItem?.id}`);
        console.log(`   - Position: #${res.position} in line`);
        console.log(`   - Topic: "${options.topic || roomName}"`);
        console.log(`💡 They will wait at their desks and automatically enter ${roomName} once the current meeting finishes.`);
        console.log(`💡 Check queue status anytime: "agent-team room-status"\n`);
      } else {
        console.log(`📋 Meeting started in [${roomName}]: "${options.topic || roomName}" with [${names.join(', ')}]`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// QUEUE-MEETING COMMAND
program
  .command('queue-meeting <names...>')
  .alias('q-meet')
  .description('Queue agents waiting for a meeting room (or any available room)')
  .option('-r, --room <room>', 'Specific meeting room (1-5 or sigma, delta, lambda, omega, infinity, Σ, Δ, λ, Ω, ∞)')
  .option('-t, --topic <topic>', 'Meeting topic/agenda')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (names, options) => {
    try {
      const port = parseInt(options.port, 10);
      const room = resolveRoomId(options.room);
      const res = await apiCall('/api/meeting-rooms/queue', 'POST', { names, topic: options.topic, room }, port);
      const targetStr = room ? (MEETING_ROOMS[room]?.fullName || `Room ${room}`) : 'Any Available Room';
      console.log(`\n⏳ Agents [${names.join(', ')}] placed in WAITING QUEUE:`);
      console.log(`   - Queue ID: ${res.queueItem?.id}`);
      console.log(`   - Position: #${res.position} for ${targetStr}`);
      console.log(`   - Topic: "${res.queueItem?.topic}"`);
      console.log(`💡 Run "agent-team room-status" to inspect live status.\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// CANCEL-QUEUE / DEQUEUE COMMAND
program
  .command('cancel-queue <queueIdOrAgent>')
  .alias('dequeue')
  .description('Cancel a queued meeting request by Queue ID (e.g. Q-123) or agent name')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (queueIdOrAgent, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/meeting-rooms/dequeue', 'POST', { id: queueIdOrAgent, name: queueIdOrAgent }, port);
      if (res.success && res.removed) {
        console.log(`✅ Cancelled meeting queue [${res.removed.id}] for agents: [${res.removed.names.join(', ')}]`);
      } else {
        console.log(`⚠️ Queue item or agent "${queueIdOrAgent}" not found in waiting queue.`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// END MEETING COMMAND
program
  .command('end-meeting [args...]')
  .description('End meeting - agents in meeting room disappear (specify room number 1-5, room symbol/name, or agent names)')
  .option('-r, --room <room>', 'Specific meeting room (1-5 or sigma, delta, lambda, omega, infinity, Σ, Δ, λ, Ω, ∞)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (args, options) => {
    try {
      const port = parseInt(options.port, 10);
      let targetRoom = resolveRoomId(options.room);
      let names: string[] = [];

      // Check if first arg is a room number or room name
      if (args && args.length > 0) {
        const resolved = resolveRoomId(args[0]);
        if (resolved && !targetRoom) {
          targetRoom = resolved;
          names = args.slice(1);
        } else {
          names = args;
        }
      }

      const res = await apiCall('/api/agents/end-meeting', 'POST', { room: targetRoom, names: names.length > 0 ? names : undefined }, port);
      const removedNames = res.removed.map((a: any) => a.name).join(', ') || 'none';
      const roomDesc = targetRoom ? (MEETING_ROOMS[targetRoom]?.fullName || `Room ${targetRoom}`) : 'All Meeting Rooms';
      console.log(`🚪 [${roomDesc}] ended. Agents disappeared: [${removedNames}]`);
      if (res.autoAdmitted) {
        const admittedRoomName = MEETING_ROOMS[res.autoAdmitted.roomId]?.fullName || `Room ${res.autoAdmitted.roomId}`;
        console.log(`\n🎉 AUTO-ADMITTED NEXT QUEUE INTO ${admittedRoomName.toUpperCase()}:`);
        console.log(`   - Queue ID: ${res.autoAdmitted.queueItem.id}`);
        console.log(`   - Topic: "${res.autoAdmitted.queueItem.topic}"`);
        console.log(`   - Agents: [${res.autoAdmitted.queueItem.names.join(', ')}]`);
        console.log(`   💡 Meeting is now active in ${admittedRoomName}!\n`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });


// REMOVE / DISMISS COMMAND
program
  .command('remove [names...]')
  .alias('dismiss')
  .alias('leave')
  .alias('despawn')
  .description('Dismiss / remove agent(s) from office (disappears with 8-bit smoke puff effect)')
  .option('--idle', 'Remove all agents who are NOT working (sleeping or meeting/idle)')
  .option('--sleeping', 'Remove all agents who are currently sleeping')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (names: string[], options) => {
    try {
      const port = parseInt(options.port, 10);
      let isIdle = !!options.idle;
      let isSleeping = !!options.sleeping;
      const targetNames: string[] = [];

      for (const n of names || []) {
        const lower = n.toLowerCase();
        if (lower === 'idle' || lower === '--idle') {
          isIdle = true;
        } else if (lower === 'sleeping' || lower === '--sleeping') {
          isSleeping = true;
        } else {
          targetNames.push(n);
        }
      }

      if (!isIdle && !isSleeping && targetNames.length === 0) {
        console.log('ℹ️ Usage:');
        console.log('  agent-team dismiss <name...>');
        console.log('  agent-team dismiss --idle       (Remove all non-working agents)');
        console.log('  agent-team dismiss --sleeping   (Remove all sleeping agents)');
        return;
      }

      const res = await apiCall('/api/agents/remove', 'POST', {
        names: targetNames.length > 0 ? targetNames : undefined,
        idle: isIdle,
        sleeping: isSleeping
      }, port);

      if (!res.removed || res.removed.length === 0) {
        console.log(`💨 No matching agents found to dismiss.`);
      } else {
        const removedList = res.removed.map((a: any) => a.name).join(', ');
        console.log(`🚪 Disappeared ${res.removed.length} agent(s) with 8-bit smoke puff: [${removedList}]`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// LIST COMMAND
program
  .command('list')
  .description('List all active agents')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const state = await apiCall('/api/agents', 'GET', undefined, port);
      if (!state.agents || state.agents.length === 0) {
        console.log('Office is empty. No active agents.');
        return;
      }
      console.log(`\n🏢 OFFICE AGENT ROSTER (${state.agents.length} active):`);
      if (state.meetingTopics && Object.keys(state.meetingTopics).length > 0) {
        for (const [rId, t] of Object.entries(state.meetingTopics)) {
          console.log(`📌 Meeting Room ${rId}: "${t}"`);
        }
      }
      console.log('---------------------------------------------------------');
      for (const a of state.agents) {
        const icon = a.status === 'working' ? '💻' : a.status === 'sleeping' ? '💤' : '💬';
        const deskNum = Math.floor(a.slot / 8) + 1;
        const seatNum = (a.slot % 8) + 1;
        const roomDesc = a.room === 'work' ? `🖥️ Desk ${deskNum} (S${seatNum})` : `📋 Meet Rm ${a.meetingRoomId || 1}`;
        const progStr = (a.status === 'working' && a.progress !== undefined) ? `[${a.progress}%]` : `[${a.status}]`;
        console.log(`${icon} ${a.name.padEnd(16)} | ${roomDesc.padEnd(18)} | ${progStr.padEnd(10)} ${a.message || ''}`);
      }
      console.log('---------------------------------------------------------\n');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// AGENTS-LIST / POTATO-LIST COMMAND
program
  .command('potato-list')
  .alias('agent-list')
  .alias('roles')
  .description('List all discovered agent roles from /Users/kittisak/workspace/agent_team/agents')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const agents: any[] = await apiCall('/api/potato-agents', 'GET', undefined, port);
      console.log(`\n🤖 AGENT TEAM ROSTER (${agents.length} agents from agents/):`);
      console.log('─'.repeat(100));
      console.log(`${'ROLE / NAME'.padEnd(20)} | ${'COLOR'.padEnd(8)} | ${'WORKBENCH'.padEnd(16)} | DESCRIPTION`);
      console.log('─'.repeat(100));
      for (const a of agents) {
        const benchName = `Bench ${a.targetBench + 1}`;
        console.log(`${a.name.padEnd(20)} | ${a.color.padEnd(8)} | ${benchName.padEnd(16)} | ${a.description.substring(0, 50)}...`);
      }
      console.log('─'.repeat(100));
      console.log('💡 Quick command: "agent-team spawn-potato" to spawn all agents into their department workbenches!\n');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// DEPARTMENTS COMMAND
program
  .command('departments')
  .alias('depts')
  .description('Display status and occupancy for all 5 Startup Departments (Product, Designer, Tech, DevOps, AI & Data)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/departments', 'GET', undefined, port);

      console.log('\n🏢 TECH STARTUP DEPARTMENTS & BENCH ALLOCATION (5 Benches x 8 Seats = 40 Seats)');
      console.log('═'.repeat(96));
      console.log(`${'BENCH'.padEnd(8)} | ${'DEPARTMENT'.padEnd(30)} | ${'SEATS'.padEnd(8)} | ACTIVE SEATED AGENTS`);
      console.log('─'.repeat(96));
      for (const d of res.departments) {
        const benchLabel = `Bench ${d.benchNumber}`;
        const occStr = `[${d.occupancy}/8]`;
        const agentNames = d.agents.length > 0 ? d.agents.map((a: any) => `${a.name}(${a.roleTitle || a.role})`).join(', ') : '(Empty bench)';
        console.log(`${benchLabel.padEnd(8)} | ${d.name.padEnd(30)} | ${occStr.padEnd(8)} | ${agentNames}`);
      }
      console.log('═'.repeat(96));
      console.log('💡 Spawn agents by department: "agent-team spawn-dept <product|designer|tech|devops|ai_data>"\n');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// SPAWN-DEPT COMMAND
program
  .command('spawn-dept <department> [count]')
  .alias('spawn-department')
  .alias('dept')
  .description('Spawn agents into a specific department: product | designer | tech | devops | ai_data')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (department, countArg, options) => {
    try {
      const port = parseInt(options.port, 10);
      const count = parseInt(countArg, 10) || 1;
      const res = await apiCall('/api/departments/spawn', 'POST', { department, count }, port);
      console.log(`\n🏢 Spawned ${res.count} agent(s) into Department [${res.department}]:`);
      for (const a of res.agents) {
        const benchNum = Math.floor(a.slot / 8) + 1;
        const seatNum = (a.slot % 8) + 1;
        console.log(`  ✨ [${a.name}] (${a.roleTitle}) -> Desk ${benchNum} (Seat ${seatNum}) [${a.color || 'default'}]`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// SPAWN-POTATO / SPAWN-ALL COMMAND
program
  .command('spawn-potato [roles...]')
  .alias('spawn-all')
  .alias('spawn-squad')
  .description('Spawn agents from /Users/kittisak/workspace/agent_team/agents (omit to spawn all agents)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (roles, options) => {
    try {
      const port = parseInt(options.port, 10);
      if (!roles || roles.length === 0 || roles.includes('all') || roles.includes('team')) {
        const res = await apiCall('/api/potato-agents/spawn-squad', 'POST', undefined, port);
        console.log(`🤖 Spawned complete agent team (${res.count} agents from agents/) across the Startup Benches!`);
        for (const a of res.agents) {
          const benchNum = Math.floor(a.slot / 8) + 1;
          const seatNum = (a.slot % 8) + 1;
          console.log(`  ✨ [${a.name}] (${a.roleTitle}) -> Desk ${benchNum} (Seat ${seatNum}) [${a.color || 'default'}]`);
        }
      } else {
        for (const role of roles) {
          const res = await apiCall('/api/agents/spawn', 'POST', { role }, port);
          const benchNum = Math.floor(res.agent.slot / 8) + 1;
          const seatNum = (res.agent.slot % 8) + 1;
          console.log(`✨ [${res.agent.name}] (${res.agent.roleTitle || role.toUpperCase()}) -> Desk ${benchNum} (Seat ${seatNum}) [${res.agent.color || 'default'}]`);
        }
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// POTATO-WORKFLOW COMMAND
program
  .command('potato-workflow <workflow>')
  .description('Run a predefined Potato-Skill meeting workflow: review | arch | qa | triage | all-hands | em')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (workflow, options) => {
    try {
      const port = parseInt(options.port, 10);
      const wf = workflow.toLowerCase();
      if (wf === 'review') {
        await apiCall('/api/agents/meet', 'POST', { names: ['coder1', 'code-reviewer1'], room: 1, topic: 'AST & Security Code Review' }, port);
        console.log(`📋 Potato Workflow [review]: coder1 & code-reviewer1 are in Sigma Room (Σ)!`);
      } else if (wf === 'arch') {
        await apiCall('/api/agents/meet', 'POST', { names: ['product-manager1', 'system-architect1'], room: 2, topic: 'PRD to Architecture Contract' }, port);
        console.log(`📋 Potato Workflow [arch]: product-manager1 & system-architect1 are in Delta Room (Δ)!`);
      } else if (wf === 'qa') {
        await apiCall('/api/agents/meet', 'POST', { names: ['qa-tester1', 'devops-release1'], room: 3, topic: 'QA Attestation & Canary Rollout' }, port);
        console.log(`📋 Potato Workflow [qa]: qa-tester1 & devops-release1 are in Lambda Room (λ)!`);
      } else if (wf === 'triage') {
        await apiCall('/api/agents/meet', 'POST', { names: ['runtime-sre1', 'coder1'], room: 4, topic: 'Runtime Incident RCA & Hotfix' }, port);
        console.log(`📋 Potato Workflow [triage]: runtime-sre1 & coder1 are in Omega Room (Ω)!`);
      } else if (wf === 'all-hands') {
        const team = ['project-planner1', 'product-manager1', 'system-architect1', 'coder1', 'code-reviewer1', 'qa-tester1', 'devops-release1', 'runtime-sre1', 'devex1'];
        await apiCall('/api/agents/meet', 'POST', { names: team, room: 5, topic: 'Sprint DAG Wave Planning' }, port);
        console.log(`📋 Potato Workflow [all-hands]: Full squad (9 agents) in Infinity Boardroom (∞)!`);
      } else if (wf === 'devex' || wf === 'dx' || wf === 'em' || wf === 'dora') {
        await apiCall('/api/agents/meet', 'POST', { names: ['devex1', 'project-planner1'], room: 5, topic: 'DORA Delivery Metrics & DevEx Bottleneck Audit' }, port);
        console.log(`📋 Potato Workflow [devex]: devex1 & project-planner1 in Infinity Boardroom (∞)!`);
      } else {
        console.log(`Unknown workflow "${workflow}". Available: review | arch | qa | triage | all-hands | devex`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// SPRINT COMMAND GROUP
const sprintCmd = program
  .command('sprint')
  .description('Manage Agile Sprint Ceremonies: 1.validation | 2.grooming | 3.planning | 4.working | 5.demo | 6.uat | 7.release | 8.retro');

sprintCmd
  .command('start [sprintNumber] [storyParts...]')
  .description('Start a new Sprint with story ticket from Taskwarrior (default), Jira, or manual')
  .option('-c, --card <id>', 'Card ID to pick from Taskwarrior or Jira')
  .option('-s, --source <source>', 'Card source provider: taskwarrior (default) | jira', 'taskwarrior')
  .option('-p, --points <number>', 'Story points estimation (default: 5 or card points)')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sprintNumber, storyParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const num = sprintNumber && /^\d+$/.test(sprintNumber) ? parseInt(sprintNumber, 10) : undefined;
      const story = Array.isArray(storyParts) && storyParts.length > 0 ? storyParts.join(' ') : (!num && sprintNumber ? sprintNumber : undefined);
      const points = options.points ? parseInt(options.points, 10) : undefined;

      const res = await apiCall('/api/sprint/start', 'POST', {
        sprintNumber: num,
        story,
        points,
        cardId: options.card,
        source: options.source
      }, port);
      console.log(`\n🏃 SPRINT #${res.sprint.sprintNumber} STARTED!`);
      const srcBadge = res.sprint.sourceCard ? `[${res.sprint.sourceCard.source.toUpperCase()}: ${res.sprint.sourceCard.id}] ` : '';
      console.log(`📋 Story Card: ${srcBadge}"${res.sprint.story}" (${res.sprint.storyPoints} pts)`);
      console.log(`📊 Phase: ${res.sprint.phase.toUpperCase()}`);
      console.log(`\n💡 Next step: Run "agent-team sprint ceremony validation" or "agent-team sprint next"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('ceremony <phase>')
  .alias('run')
  .description('Run a Sprint Ceremony: 1.validation | 2.grooming | 3.planning | 4.working | 5.demo | 6.uat | 7.release | 8.retro')
  .option('-p, --points <number>', 'Story points (for grooming phase)')
  .option('-t, --topic <text>', 'Custom ceremony topic')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (phase, options) => {
    try {
      const port = parseInt(options.port, 10);
      const points = options.points ? parseInt(options.points, 10) : undefined;
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase, points, topic: options.topic }, port);
      const c = res.ceremony;
      console.log(`\n🎉 SPRINT CEREMONY #${c.phaseIndex}: ${c.name.toUpperCase()}`);
      console.log(`📝 Description: ${c.description}`);
      console.log(`🏷️ Topic: "${c.topic}"`);
      if (c.room) {
        console.log(`🏢 Location: Meeting Room ${c.room}`);
        console.log(`👥 Attendees: [${c.attendees.join(', ')}]`);
      } else {
        console.log(`💻 Location: Open-Space Workbenches (All agents actively working)`);
      }
      console.log(`\n💡 To advance: Run "agent-team sprint next"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('next')
  .description('Advance to the next Sprint Ceremony in sequence (enforces mandatory Slack thread sign-off)')
  .option('-f, --force', 'Bypass ceremony thread discussion sign-off policy gate (emergency override)')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/next', 'POST', { force: options.force }, port);
      if (res.completed) {
        console.log(`\n🏆 SPRINT #${res.sprint.sprintNumber} COMPLETED!`);
        console.log(`Retrospective concluded and all ceremony governance artifacts archived.\n`);
        return;
      }
      const c = res.ceremony;
      console.log(`\n⏩ ADVANCED TO SPRINT CEREMONY #${c.phaseIndex}: ${c.name.toUpperCase()}`);
      console.log(`📝 Description: ${c.description}`);
      console.log(`🏷️ Topic: "${c.topic}"`);
      if (c.room) {
        console.log(`🏢 Location: Meeting Room ${c.room} with [${c.attendees.join(', ')}]`);
      } else {
        console.log(`💻 Location: Open-Space Workbenches (All agents coding at desks)`);
      }
      console.log(`\n💡 To advance: Run "agent-team sprint next"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('check [phase]')
  .description('Verify whether ceremony Slack thread discussion has met required sign-offs before advancing')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (phase, options) => {
    try {
      const port = parseInt(options.port, 10);
      const query = phase ? `?phase=${encodeURIComponent(phase)}` : '';
      const res = await apiCall(`/api/sprint/ceremony-check${query}`, 'GET', undefined, port);
      const statusIcon = res.satisfied ? '✅ SATISFIED' : '🚫 BLOCKED';
      console.log(`\n🏛️ CEREMONY DISCUSSION GATE: [${statusIcon}]`);
      console.log('═'.repeat(70));
      console.log(`Phase: ${res.phase.toUpperCase()} | Thread ID: [${res.threadId}]`);
      console.log(`Messages Logged: ${res.messagesCount}`);
      console.log(`Required Stakeholders: ${res.requiredRoles.map((r: string) => '@' + r).join(', ') || 'None'}`);
      console.log(`Missing Contributions: ${res.missingRoles.length > 0 ? res.missingRoles.map((r: string) => '@' + r).join(', ') : 'None (All satisfied)'}`);
      console.log('─'.repeat(70));
      if (res.satisfied) {
        console.log(`✨ Status: Ready to advance to the next ceremony phase!\n`);
      } else {
        console.log(`⚠️ Status: Advance is BLOCKED! Attending agents must post discussion in the thread first.\n`);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('complete [summaryParts...]')
  .alias('finish')
  .alias('done')
  .alias('close')
  .description('Complete and archive current Sprint after Retrospective (Phase 8)')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (summaryParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const summary = summaryParts && summaryParts.length > 0 ? summaryParts.join(' ') : undefined;
      const res = await apiCall('/api/sprint/complete', 'POST', { summary }, port);
      console.log(`\n🏆 SPRINT #${res.record.sprintNumber} COMPLETED & ARCHIVED!`);
      console.log(`📋 Story Card: "${res.record.story}" (${res.record.storyPoints} pts)`);
      console.log(`⏱️ Ceremonies Executed: ${res.record.ceremoniesCount} phases`);
      console.log(`📝 Summary: "${res.record.summary}"`);
      console.log(`\n💡 To start the next sprint cycle, run: "agent-team sprint start"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('status')
  .description('Display current Sprint phase, active ceremony, story points, and history')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint', 'GET', undefined, port);
      const s = res.sprint;

      const CEREMONIES = [
        { idx: 1, key: 'validation', name: '1. Validation' },
        { idx: 2, key: 'grooming', name: '2. Grooming' },
        { idx: 3, key: 'planning', name: '3. Planning' },
        { idx: 4, key: 'working', name: '4. Work' },
        { idx: 5, key: 'demo', name: '5. Demo' },
        { idx: 6, key: 'uat', name: '6. UAT Sign-Off' },
        { idx: 7, key: 'release', name: '7. Release Prod' },
        { idx: 8, key: 'retro', name: '8. Retro' }
      ];

      console.log(`\n══════════════════════════════════════════════════════════════════════`);
      console.log(`🏃 SPRINT #${s.sprintNumber} STATUS REPORT ${s.phase === 'completed' ? '🏆 [COMPLETED]' : ''}`);
      console.log(`══════════════════════════════════════════════════════════════════════`);
      const srcBadge = s.sourceCard ? `[${s.sourceCard.source.toUpperCase()}: ${s.sourceCard.id}] ` : '';
      console.log(`📋 Story Card:   ${srcBadge}"${s.story}"`);
      console.log(`🎯 Story Points:  ${s.storyPoints || 'Not estimated'} pts`);
      console.log(`📍 Current Phase: ${s.phase.toUpperCase()} (${s.phaseIndex}/8)`);
      console.log(`\n📈 SPRINT PIPELINE:`);
      const badges = CEREMONIES.map(c => {
        if (s.phase === 'completed' || c.idx < s.phaseIndex) return `[✅ ${c.name}]`;
        if (c.idx === s.phaseIndex) return `[▶️ ${c.name.toUpperCase()}]`;
        return `[⬜ ${c.name}]`;
      });
      console.log(`   ${badges.join(' ➔ ')}`);

      if (s.activeCeremony) {
        console.log(`\n🔔 Active Ceremony: "${s.activeCeremony.topic}"`);
        if (s.activeCeremony.room) {
          console.log(`   Room: ${s.activeCeremony.room} | Attendees: [${s.activeCeremony.attendees.join(', ')}]`);
        }
      }

      if (s.completedSprints && s.completedSprints.length > 0) {
        console.log(`\n🏆 COMPLETED SPRINTS ARCHIVE (${s.completedSprints.length} sprints total):`);
        s.completedSprints.forEach((r: any) => {
          const dStr = new Date(r.completedAt).toLocaleTimeString();
          console.log(`   ✨ Sprint #${r.sprintNumber}: "${r.story}" [${r.storyPoints || 5} pts] (Finished at ${dStr})`);
        });
      }

      if (s.phase === 'completed') {
        console.log(`\n🎉 Sprint is concluded! Run "agent-team sprint start" to begin the next sprint.`);
      }
      console.log(`══════════════════════════════════════════════════════════════════════\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('dora [sprintNumber]')
  .alias('accelerate')
  .alias('devex')
  .alias('dx')
  .description('Display 4 DORA delivery metrics, DevEx directives compliance, and bottleneck diagnosis')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sprintNumber, options) => {
    try {
      const port = parseInt(options.port, 10);
      const url = sprintNumber ? `/api/sprint/dora?sprint=${sprintNumber}` : '/api/sprint/dora';
      const res = await apiCall(url, 'GET', undefined, port);
      const d = res.dora;

      console.log(`\n══════════════════════════════════════════════════════════════════════`);
      console.log(`📊 ACCELERATE & DORA DELIVERY METRICS SCORECARD (Sprint #${d.sprintNumber})`);
      console.log(`   Audited by: Developer Experience (DevEx - Accelerate Champion)`);
      console.log(`   Story: "${d.story}"`);
      console.log(`   Overall Rating: 🚀 [${d.overallTier.toUpperCase()} PERFORMER]`);
      console.log(`══════════════════════════════════════════════════════════════════════`);
      console.log(`\n4 CORE DORA METRICS:`);
      console.log(`  1. Deployment Frequency (DF):      ${d.deploymentFrequency.value} [${d.deploymentFrequency.tier}]`);
      console.log(`     Target: ${d.deploymentFrequency.target}`);
      console.log(`  2. Lead Time for Changes (LT):     ${d.leadTimeForChanges.value} [${d.leadTimeForChanges.tier}]`);
      console.log(`     Target: ${d.leadTimeForChanges.target}`);
      console.log(`  3. Change Failure Rate (CFR):      ${d.changeFailureRate.value} [${d.changeFailureRate.tier}]`);
      console.log(`     Target: ${d.changeFailureRate.target}`);
      console.log(`  4. Time to Restore Service (MTTR):  ${d.timeToRestoreService.value} [${d.timeToRestoreService.tier}]`);
      console.log(`     Target: ${d.timeToRestoreService.target}`);
      console.log(`\n🎯 DEVEX MANDATES & COMPLIANCE MEASUREMENT (ทุกคนต้องทำตาม และวัดผล):`);
      if (d.devexDirectives && d.devexDirectives.length > 0) {
        d.devexDirectives.forEach((dir: any) => {
          console.log(`  • [${dir.status.toUpperCase()}] ${dir.directive} (${dir.stage.toUpperCase()})`);
          console.log(`    Mandate: ${dir.mandate}`);
          if (dir.measuredImpact) console.log(`    Measured Impact: ${dir.measuredImpact}`);
        });
      }
      if (d.historicalComparison) {
        console.log(`\n📈 SPRINT-OVER-SPRINT COMPARISON (Sprint #${d.historicalComparison.previousSprint}):`);
        console.log(`  • Throughput Trend: ${d.historicalComparison.throughputTrend}`);
        console.log(`  • Lead Time Delta:  ${d.historicalComparison.leadTimeDelta}`);
        console.log(`  • Compliance Rate:  ${d.historicalComparison.directivesComplianceRate}`);
      }
      console.log(`\n🔍 BOTTLENECK DIAGNOSIS (Theory of Constraints):`);
      console.log(`  • Primary Bottleneck:    ${d.bottleneckAnalysis.primaryBottleneck}`);
      console.log(`  • Throughput Impact:     ${d.bottleneckAnalysis.throughputImpact}`);
      console.log(`  • Recommended Capability: ${d.bottleneckAnalysis.recommendedCapability}`);
      console.log(`  • WIP Flow Status:       ${d.bottleneckAnalysis.wipStatus}`);
      console.log(`\n🛠️ ACCELERATE CAPABILITIES AUDIT:`);
      d.accelerateCapabilities.forEach((c: any) => {
        console.log(`  [${c.status}] ${c.capability} (${c.stage})`);
        console.log(`      ↳ ${c.impact}`);
      });
      console.log(`══════════════════════════════════════════════════════════════════════\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// TOP-LEVEL SHORTCUT ALIASES FOR SPRINT CEREMONIES
program
  .command('validate [storyParts...]')
  .description('Shortcut: Run Ceremony 1 - PO & Dev Story Validation')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (storyParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const story = storyParts && storyParts.length > 0 ? storyParts.join(' ') : undefined;
      if (story) await apiCall('/api/sprint/start', 'POST', { story }, port);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'validation' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #1: STORY VALIDATION & REFINEMENT`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('groom [points]')
  .description('Shortcut: Run Ceremony 2 - Backlog Grooming & Point Estimation')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (points, options) => {
    try {
      const port = parseInt(options.port, 10);
      const pts = points ? parseInt(points, 10) : undefined;
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'grooming', points: pts }, port);
      console.log(`\n🎉 SPRINT CEREMONY #2: BACKLOG GROOMING & POINT ESTIMATION`);
      console.log(`🎯 Estimated: ${res.sprint.storyPoints} Story Points`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('plan')
  .description('Shortcut: Run Ceremony 3 - Sprint Planning & Task Distribution in Boardroom')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'planning' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #3: SPRINT PLANNING & TASK DISTRIBUTION`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} (Boardroom) with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('demo')
  .description('Shortcut: Run Ceremony 5 - Sprint Feature Demo')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'demo' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #5: SPRINT FEATURE DEMO`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('uat')
  .alias('sign-off')
  .alias('uat-sign-off')
  .description('Shortcut: Run Ceremony 6 - UAT Acceptance & Formal Sign-Off')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'uat' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #6: UAT ACCEPTANCE & FORMAL SIGN-OFF`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('release')
  .alias('release-prod')
  .alias('deploy-prod')
  .description('Shortcut: Run Ceremony 7 - Production Release & Canary Rollout')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'release' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #7: PRODUCTION RELEASE & CANARY ROLLOUT`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('retro')
  .description('Shortcut: Run Ceremony 8 - Sprint Retrospective in Boardroom')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'retro' }, port);
      console.log(`\n🎉 SPRINT CEREMONY #8: SPRINT RETROSPECTIVE (LESSONS LEARNED)`);
      console.log(`🏢 Location: Meeting Room ${res.ceremony.room} (Boardroom) with [${res.ceremony.attendees.join(', ')}]`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('complete-sprint [summaryParts...]')
  .alias('finish-sprint')
  .description('Shortcut: Complete and archive the current sprint cycle')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (summaryParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const summary = summaryParts && summaryParts.length > 0 ? summaryParts.join(' ') : undefined;
      const res = await apiCall('/api/sprint/complete', 'POST', { summary }, port);
      console.log(`\n🏆 SPRINT #${res.record.sprintNumber} COMPLETED!`);
      console.log(`💡 Start the next sprint cycle anytime with: "agent-team start-sprint" or "agent-team sprint start"`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('dora [sprintNumber]')
  .alias('accelerate')
  .alias('devex')
  .alias('dx')
  .description('Shortcut: Display 4 DORA delivery metrics & DevEx directives scorecard')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sprintNumber, options) => {
    try {
      const port = parseInt(options.port, 10);
      const url = sprintNumber ? `/api/sprint/dora?sprint=${sprintNumber}` : '/api/sprint/dora';
      const res = await apiCall(url, 'GET', undefined, port);
      const d = res.dora;
      console.log(`\n══════════════════════════════════════════════════════════════════════`);
      console.log(`📊 ACCELERATE & DORA DELIVERY METRICS SCORECARD (Sprint #${d.sprintNumber})`);
      console.log(`   Audited by: Developer Experience (DevEx - Accelerate Champion)`);
      console.log(`   Story: "${d.story}"`);
      console.log(`   Overall Rating: 🚀 [${d.overallTier.toUpperCase()} PERFORMER]`);
      console.log(`══════════════════════════════════════════════════════════════════════`);
      console.log(`\n4 CORE DORA METRICS:`);
      console.log(`  1. Deployment Frequency (DF):      ${d.deploymentFrequency.value} [${d.deploymentFrequency.tier}]`);
      console.log(`  2. Lead Time for Changes (LT):     ${d.leadTimeForChanges.value} [${d.leadTimeForChanges.tier}]`);
      console.log(`  3. Change Failure Rate (CFR):      ${d.changeFailureRate.value} [${d.changeFailureRate.tier}]`);
      console.log(`  4. Time to Restore Service (MTTR):  ${d.timeToRestoreService.value} [${d.timeToRestoreService.tier}]`);
      console.log(`\n🎯 DEVEX MANDATES & COMPLIANCE MEASUREMENT (ทุกคนต้องทำตาม และวัดผล):`);
      if (d.devexDirectives && d.devexDirectives.length > 0) {
        d.devexDirectives.forEach((dir: any) => {
          console.log(`  • [${dir.status.toUpperCase()}] ${dir.directive} (${dir.stage.toUpperCase()})`);
          if (dir.measuredImpact) console.log(`    Measured Impact: ${dir.measuredImpact}`);
        });
      }
      if (d.historicalComparison) {
        console.log(`\n📈 SPRINT-OVER-SPRINT COMPARISON:`);
        console.log(`  • Throughput Trend: ${d.historicalComparison.throughputTrend}`);
        console.log(`  • Lead Time Delta:  ${d.historicalComparison.leadTimeDelta}`);
      }
      console.log(`\n🔍 BOTTLENECK DIAGNOSIS:`);
      console.log(`  • Primary Bottleneck:    ${d.bottleneckAnalysis.primaryBottleneck}`);
      console.log(`  • Recommended Capability: ${d.bottleneckAnalysis.recommendedCapability}`);
      console.log(`  • WIP Flow Status:       ${d.bottleneckAnalysis.wipStatus}`);
      console.log(`══════════════════════════════════════════════════════════════════════\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program
  .command('start-sprint [sprintNumber] [storyParts...]')
  .description('Shortcut: Start a new sprint cycle with card from Taskwarrior (default) or Jira')
  .option('-c, --card <id>', 'Card ID to pick from Taskwarrior or Jira')
  .option('-s, --source <source>', 'Card source provider: taskwarrior (default) | jira', 'taskwarrior')
  .option('-p, --points <number>', 'Story points estimation')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sprintNumber, storyParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const num = sprintNumber && /^\d+$/.test(sprintNumber) ? parseInt(sprintNumber, 10) : undefined;
      const story = Array.isArray(storyParts) && storyParts.length > 0 ? storyParts.join(' ') : (!num && sprintNumber ? sprintNumber : undefined);
      const points = options.points ? parseInt(options.points, 10) : undefined;
      const res = await apiCall('/api/sprint/start', 'POST', {
        sprintNumber: num,
        story,
        points,
        cardId: options.card,
        source: options.source
      }, port);
      console.log(`\n🏃 SPRINT #${res.sprint.sprintNumber} STARTED!`);
      const srcBadge = res.sprint.sourceCard ? `[${res.sprint.sourceCard.source.toUpperCase()}: ${res.sprint.sourceCard.id}] ` : '';
      console.log(`📋 Story Card: ${srcBadge}"${res.sprint.story}" (${res.sprint.storyPoints} pts)`);
      console.log(`💡 Next step: Run "agent-team validate" or "agent-team sprint next"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// CARDS / BACKLOG COMMAND (Taskwarrior default, or Jira)
program
  .command('cards [source]')
  .alias('backlog')
  .alias('kanban')
  .description('List backlog story cards from Taskwarrior (default) or Jira')
  .option('-s, --source <source>', 'Card source: taskwarrior (default) | jira', 'taskwarrior')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sourceArg, options) => {
    try {
      const port = parseInt(options.port, 10);
      const source = (sourceArg || options.source || 'taskwarrior').toLowerCase();
      const res = await apiCall(`/api/cards?source=${source}`, 'GET', undefined, port);
      console.log(`\n📋 STORY CARDS BACKLOG [${source.toUpperCase()}] (${res.cards.length} cards):`);
      console.log('═'.repeat(90));
      console.log(`${'ID'.padEnd(8)} | ${'STATUS'.padEnd(12)} | ${'PTS'.padEnd(5)} | ${'PRI'.padEnd(5)} | TITLE & TAGS`);
      console.log('─'.repeat(90));
      for (const c of res.cards) {
        const statIcon = c.status === 'done' ? '✅ DONE' : c.status === 'in_progress' ? '▶️ IN_PROG' : '⬜ TODO';
        const pts = c.points !== undefined ? `${c.points} pt` : '-';
        const pri = c.priority || '-';
        const tags = c.tags && c.tags.length > 0 ? ` [${c.tags.join(', ')}]` : '';
        console.log(`${String(c.id).padEnd(8)} | ${statIcon.padEnd(12)} | ${pts.padEnd(5)} | ${pri.padEnd(5)} | ${c.title}${tags}`);
      }
      console.log('═'.repeat(90));
      console.log(`💡 Start sprint with card: "agent-team sprint start -c <id> -s ${source}"`);
      console.log(`💡 Add new card: "agent-team card-add <title> -p <points>"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// CARD-ADD COMMAND
program
  .command('card-add <titleParts...>')
  .alias('add-card')
  .description('Add a new story card to Taskwarrior (default kanban backlog)')
  .option('-p, --points <number>', 'Story points estimation (e.g. 3, 5, 8)', '5')
  .option('-t, --tags <tags>', 'Comma-separated tags (e.g. auth,backend)')
  .option('--priority <pri>', 'Priority (H, M, L)', 'M')
  .option('-s, --source <source>', 'Card source provider (default: taskwarrior)', 'taskwarrior')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (titleParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const title = titleParts.join(' ');
      const points = parseInt(options.points, 10) || 5;
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;
      const res = await apiCall('/api/cards/add', 'POST', {
        title,
        points,
        tags,
        priority: options.priority,
        source: options.source || 'taskwarrior'
      }, port);
      console.log(`\n✨ CREATED STORY CARD [${res.card.source.toUpperCase()}] #${res.card.id}:`);
      console.log(`📋 Title:  "${res.card.title}"`);
      console.log(`🎯 Points: ${res.card.points || '-'} pts | Priority: ${res.card.priority || '-'}`);
      if (res.card.tags && res.card.tags.length > 0) {
        console.log(`🏷️ Tags:   [${res.card.tags.join(', ')}]`);
      }
      console.log(`\n💡 To start sprint with this card: "agent-team sprint start -c ${res.card.id}"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// RESET / CLOCK-OUT COMMAND (Everyone go home / End of day)
program
  .command('reset')
  .alias('clock-out')
  .alias('clockout')
  .alias('go-home')
  .alias('gohome')
  .alias('off-work')
  .alias('end-day')
  .alias('clear')
  .description('Clock out / End shift: all agents pack up, leave the office, and go home')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/reset', 'POST', undefined, port);
      console.log(`\n🏠 Shift ended! All agents clocked out and went home.`);
      console.log(`🧹 The office is clear, lights are dimmed, and ready for tomorrow!\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// OPEN COMMAND
program
  .command('open')
  .description('Open browser UI')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    await ensureServer(port);
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawn(openCmd, [getBaseUrl(port)], { detached: true, stdio: 'ignore' }).unref();
    console.log(`🌐 Opened ${getBaseUrl(port)}`);
  });

// GENERATE-ASSETS COMMAND (Pyxel + ImageMagick)
program
  .command('generate-assets')
  .description('Generate 8-bit characters, animation frames, spritesheets & GIFs using Pyxel & ImageMagick')
  .action(() => {
    console.log(`🚀 Starting Pixel Art Generation Toolchain...`);
    const pyScript = path.resolve(__dirname, '../../tools/pixel_engine.py');
    const imScript = path.resolve(__dirname, '../../tools/imagemagick_pipeline.sh');

    const py = spawn('python3', [pyScript], { stdio: 'inherit' });
    py.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ Pyxel asset generation failed.`);
        return;
      }
      const im = spawn('bash', [imScript], { stdio: 'inherit' });
      im.on('exit', (imCode) => {
        if (imCode === 0) {
          console.log(`\n🎉 Assets generated in public/assets!`);
          console.log(`- Spritesheet: public/assets/spritesheet.png`);
          console.log(`- Metadata (LibreSprite/Aseprite): public/assets/spritesheet.json`);
          console.log(`- Animated GIFs: public/assets/gifs/`);
        }
      });
    });
  });

// PYXEL-EDIT COMMAND
program
  .command('pyxel-edit')
  .description('Launch Pyxel (MIT) visual sprite and sound editor')
  .action(() => {
    const pyxres = path.resolve(__dirname, '../../public/assets/office.pyxres');
    console.log(`🎮 Launching Pyxel Retro Editor for ${pyxres}...`);
    const child = spawn('pyxel', ['edit', pyxres], { stdio: 'inherit' });
    child.on('error', () => {
      console.log(`💡 Tip: Install Pyxel CLI or run "python3 -m pyxel edit ${pyxres}"`);
      spawn('python3', ['-m', 'pyxel', 'edit', pyxres], { stdio: 'inherit' });
    });
  });

// MCP COMMAND
program
  .command('mcp')
  .description('Start Model Context Protocol (MCP) stdio server for Claude Code and Claude Desktop')
  .action(async () => {
    const { runMcpServer } = await import('../mcp/index.js');
    await runMcpServer();
  });

// SESSIONS COMMANDS
async function renderSessionsList(port: number) {
  const res = await apiCall('/api/sessions', 'GET', undefined, port);
  const current = resolveSession(program.opts().session);
  const persistent = getPersistentSession();
  const persistentNote = persistent ? ` [PERSISTENT OVERRIDE: "${persistent}"]` : ' [AUTO-DIR TRACKING]';
  console.log(`\n📁 ACTIVE PROJECT SESSIONS (Current: "${current}"${persistentNote})`);
  console.log('═'.repeat(95));
  console.log(
    'SESSION NAME'.padEnd(25) + ' | ' +
    'AGENTS'.padEnd(16) + ' | ' +
    'SPRINT'.padEnd(14) + ' | ' +
    'PHASE'.padEnd(16) + ' | ' +
    'CURRENT STORY'
  );
  console.log('─'.repeat(95));
  for (const s of res.sessions || []) {
    const isCurrent = s.id === current;
    const prefix = isCurrent ? '👉 ' : '   ';
    const nameCol = (prefix + s.name).padEnd(25);
    const agentsCol = `${s.agentCount} (${s.workingCount}w / ${s.meetingCount}m)`.padEnd(16);
    const sprintCol = `Sprint #${s.sprintNumber}`.padEnd(14);
    const phaseCol = s.sprintPhase.toUpperCase().padEnd(16);
    const storyCol = (s.story || '-').slice(0, 22);
    console.log(`${nameCol} | ${agentsCol} | ${sprintCol} | ${phaseCol} | ${storyCol}`);
  }
  console.log('═'.repeat(95));
  console.log(`💡 Switch persistent session with: "agent-team session switch <name>" or target once with: "-S <name>"\n`);
}

program
  .command('sessions')
  .alias('session-list')
  .description('List all project directory sessions and their status')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      await renderSessionsList(parseInt(options.port, 10));
    } catch (err: any) {
      console.error(`❌ Failed to list sessions: ${err.message}`);
    }
  });

program
  .command('session-current')
  .description('Print the currently active session name (derived from current project dir, env, or persistent override)')
  .action(() => {
    const session = resolveSession(program.opts().session);
    const persistent = getPersistentSession();
    console.log(`📁 Current active session: "${session}"`);
    if (persistent) {
      console.log(`📌 Source: Persistent override from ~/.agent-team/config.json ("${persistent}")`);
      console.log(`💡 Run "agent-team session auto" to revert to directory auto-tracking.`);
    } else {
      console.log(`📌 Source: Current working directory "${path.basename(process.cwd())}"`);
    }
  });

program
  .command('session-create <name>')
  .description('Create or connect to a new project directory session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sessions', 'POST', { name }, port);
      console.log(`✨ Project session created / connected: "${res.session}"`);
      console.log(`💡 View in browser at http://localhost:${port}?session=${res.session}`);
    } catch (err: any) {
      console.error(`❌ Failed to create session: ${err.message}`);
    }
  });

program
  .command('session-switch <name>')
  .alias('session-use')
  .description('Switch the default persistent active session for CLI commands')
  .action((name) => {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    setPersistentSession(clean);
    console.log(`🔄 Switched persistent active session to: "${clean}"`);
    console.log(`💡 All CLI commands will now target "${clean}". Run "agent-team session auto" to revert to directory auto-tracking.`);
  });

program
  .command('session-auto')
  .alias('session-unuse')
  .description('Clear persistent session override and revert to automatic directory name detection')
  .action(() => {
    setPersistentSession(undefined);
    console.log(`🔄 Reverted to directory auto-tracking. Current directory session: "${path.basename(process.cwd())}"`);
  });

program
  .command('session-reset <name>')
  .description('Reset all agents, meetings, and sprint state for a specific session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const res = await apiCall(`/api/sessions/${encodeURIComponent(clean)}/reset`, 'POST', undefined, port);
      console.log(`🔄 Session "${clean}" reset: cleared ${res.count} agents and reset sprint.`);
    } catch (err: any) {
      console.error(`❌ Failed to reset session: ${err.message}`);
    }
  });

program
  .command('session-delete <name>')
  .description('Delete a project directory session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall(`/api/sessions/${encodeURIComponent(name)}`, 'DELETE', undefined, port);
      console.log(`🗑️ Session "${name}" deleted: ${res.success}`);
    } catch (err: any) {
      console.error(`❌ Failed to delete session: ${err.message}`);
    }
  });

// SESSION SUBCOMMAND GROUP
const sessionGroup = program
  .command('session')
  .description('Manage project directory sessions (list, current, create, switch, auto, reset, delete)');

sessionGroup
  .command('list')
  .alias('ls')
  .description('List all project directory sessions')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      await renderSessionsList(parseInt(options.port, 10));
    } catch (err: any) {
      console.error(`❌ Failed to list sessions: ${err.message}`);
    }
  });

sessionGroup
  .command('current')
  .description('Show the currently active project session')
  .action(() => {
    const session = resolveSession(program.opts().session);
    const persistent = getPersistentSession();
    console.log(`📁 Current active session: "${session}"`);
    if (persistent) {
      console.log(`📌 Source: Persistent override from ~/.agent-team/config.json ("${persistent}")`);
    } else {
      console.log(`📌 Source: Current working directory "${path.basename(process.cwd())}"`);
    }
  });

sessionGroup
  .command('create <name>')
  .description('Create or connect to a project directory session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sessions', 'POST', { name }, port);
      console.log(`✨ Project session created / connected: "${res.session}"`);
      console.log(`💡 View in browser at http://localhost:${port}?session=${res.session}`);
    } catch (err: any) {
      console.error(`❌ Failed to create session: ${err.message}`);
    }
  });

sessionGroup
  .command('switch <name>')
  .alias('use')
  .description('Switch the default active session')
  .action((name) => {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    setPersistentSession(clean);
    console.log(`🔄 Switched persistent active session to: "${clean}"`);
  });

sessionGroup
  .command('auto')
  .alias('unuse')
  .description('Revert to automatic directory detection')
  .action(() => {
    setPersistentSession(undefined);
    console.log(`🔄 Reverted to directory auto-tracking. Current directory session: "${path.basename(process.cwd())}"`);
  });

sessionGroup
  .command('reset <name>')
  .description('Reset a session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const res = await apiCall(`/api/sessions/${encodeURIComponent(clean)}/reset`, 'POST', undefined, port);
      console.log(`🔄 Session "${clean}" reset: cleared ${res.count} agents and reset sprint.`);
    } catch (err: any) {
      console.error(`❌ Failed to reset session: ${err.message}`);
    }
  });

sessionGroup
  .command('delete <name>')
  .alias('rm')
  .description('Delete a session')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (name, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall(`/api/sessions/${encodeURIComponent(name)}`, 'DELETE', undefined, port);
      console.log(`🗑️ Session "${name}" deleted: ${res.success}`);
    } catch (err: any) {
      console.error(`❌ Failed to delete session: ${err.message}`);
    }
  });

// INSTALL-HOOKS COMMAND
// Copies the battle-tested Claude Code sync hooks (see docs/agent-team-sync-hooks.md) into a
// host project so the office dashboard reflects real subagent dispatch/completion as a
// structural guarantee, instead of depending on Claude remembering to call office_set_work
// itself every time. Run this yourself in your terminal (not something Claude should do via
// its own Edit/Write tools) — editing .claude/settings.json to add hooks that govern Claude's
// own control flow (especially the Stop hook) can be refused by Claude Code's own permission
// system as "Self-Modification" when Claude tries to do it itself. A plain CLI command you run
// has no such restriction.
program
  .command('install-hooks [targetDir]')
  .description(
    'Install the PostToolUse/SubagentStop/UserPromptSubmit/Stop sync hooks into a host ' +
    'project\'s .claude/ directory, so its office dashboard and story-continuation behavior ' +
    'are structurally guaranteed rather than dependent on Claude remembering to call ' +
    'office_set_work or re-read CLAUDE.md every turn. The UserPromptSubmit hook auto-dismisses ' +
    'any desk stuck "working" for 10+ minutes (a TTL safety net for completion events whose ' +
    'name mapping missed). Safe to re-run (idempotent, merges rather than clobbers existing hooks).'
  )
  .option('--skip-stop-hook', 'Only install the dashboard-sync hooks (PostToolUse/SubagentStop), skip the Stop story-continue-guard')
  .action((targetDirArg: string | undefined, options: { skipStopHook?: boolean }) => {
    const targetDir = path.resolve(targetDirArg || process.cwd());
    const templatesDir = path.resolve(__dirname, '../../templates/hooks');
    const hooksDestDir = path.join(targetDir, '.claude', 'hooks');
    const settingsPath = path.join(targetDir, '.claude', 'settings.json');

    if (!fs.existsSync(targetDir)) {
      console.error(`❌ Target directory does not exist: ${targetDir}`);
      process.exitCode = 1;
      return;
    }

    fs.mkdirSync(hooksDestDir, { recursive: true });

    const filesToCopy = ['sync-agent-team.js', 'subagent-stop-sync.js', 'office-stale-cleanup.js', 'real-desks-state.js', 'ceremony-cleanup.js', 'needs-input-watcher.js'];
    if (!options.skipStopHook) filesToCopy.push('story-continue-guard.cjs');

    for (const file of filesToCopy) {
      const src = path.join(templatesDir, file);
      const dest = path.join(hooksDestDir, file);
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o755);
      console.log(`📄 Installed .claude/hooks/${file}`);
    }

    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {
        console.error(`❌ ${settingsPath} exists but is not valid JSON — not touching it. Merge these hooks in by hand:`);
        console.error(JSON.stringify(buildHookEntries(options.skipStopHook), null, 2));
        process.exitCode = 1;
        return;
      }
    }

    settings.hooks = settings.hooks || {};
    const entries = buildHookEntries(options.skipStopHook);
    for (const [event, newEntries] of Object.entries(entries)) {
      const existing: any[] = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
      const alreadyPresent = (entry: any) =>
        existing.some((e) => JSON.stringify(e) === JSON.stringify(entry));
      const toAdd = (newEntries as any[]).filter((e) => !alreadyPresent(e));
      settings.hooks[event] = [...existing, ...toAdd];
    }

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`⚙️  Updated ${settingsPath}`);
    console.log(
      `\n✅ Hooks installed. Dashboard dispatch/completion sync is now automatic` +
      (options.skipStopHook ? '.' : ', and the session cannot silently stop mid-story (see docs/agent-team-sync-hooks.md for the escape hatch: reply with "STORY-BLOCKED: <reason>" when genuinely blocked on a human step).')
    );
  });

function buildHookEntries(skipStopHook?: boolean) {
  const entries: Record<string, any[]> = {
    PostToolUse: [
      {
        matcher: 'Agent',
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/sync-agent-team.js'], timeout: 5 }],
      },
      {
        matcher: 'mcp__agent-team__office_sprint_ceremony|mcp__agent-team__office_sprint_start|mcp__agent-team__office_sprint_next|mcp__agent-team__office_sprint_complete',
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/ceremony-cleanup.js'], timeout: 5 }],
      },
    ],
    SubagentStop: [
      {
        hooks: [
          { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/subagent-stop-sync.js'], timeout: 5 },
          { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/needs-input-watcher.js'], timeout: 5 },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/office-stale-cleanup.js'], timeout: 5 }],
      },
    ],
  };
  if (!skipStopHook) {
    entries.Stop = [
      {
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/story-continue-guard.cjs'], timeout: 10 }],
      },
    ];
  }
  return entries;
}

// THREAD / SLACK FEED COMMANDS
const threadCmd = program
  .command('thread')
  .alias('threads')
  .description('Manage Retro Slack-like discussion threads & Smart Brevity posts');

threadCmd
  .command('list')
  .description('List office discussion threads')
  .option('-c, --category <type>', 'Filter by category (meeting, ceremony, consult, general)')
  .option('-r, --room <number>', 'Filter by meeting room (1..5)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const params = new URLSearchParams();
      if (options.category) params.set('category', options.category);
      if (options.room) params.set('roomId', options.room);
      const query = params.toString() ? `?${params.toString()}` : '';

      const res = await apiCall(`/api/threads${query}`, 'GET', undefined, port);
      const threads = res.threads || [];
      if (threads.length === 0) {
        console.log('💬 No discussion threads found.');
        return;
      }

      console.log(`\n💬 OFFICE SLACK THREADS (${threads.length} total):`);
      console.log('═'.repeat(70));
      for (const t of threads) {
        const lastMsg = t.messages[t.messages.length - 1];
        const time = new Date(t.updatedAt).toLocaleTimeString();
        console.log(`📌 [${t.id}] ${t.title}`);
        console.log(`   Category: ${t.category.toUpperCase()} | Messages: ${t.messages.length} | Updated: ${time}`);
        if (lastMsg) {
          const snip = (lastMsg.point || lastMsg.content).replace(/\n/g, ' ').slice(0, 80);
          console.log(`   Latest by @${lastMsg.author}: "${snip}..."`);
        }
        console.log('─'.repeat(70));
      }
      console.log('💡 View full thread: agent-team thread view <thread_id>\n');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('view <threadId>')
  .description('View full message history of a thread')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall(`/api/threads/${encodeURIComponent(threadId)}`, 'GET', undefined, port);
      const t = res.thread;
      if (!t) {
        console.log(`❌ Thread "${threadId}" not found.`);
        return;
      }

      console.log(`\n📌 THREAD: ${t.title} [${t.id}]`);
      console.log(`📂 Category: ${t.category.toUpperCase()} | Created by: @${t.createdBy}`);
      console.log(`👥 Participants: ${t.mentions.join(', ') || '@' + t.createdBy}`);
      console.log('═'.repeat(70));
      for (let i = 0; i < t.messages.length; i++) {
        const m = t.messages[i];
        const time = new Date(m.timestamp).toLocaleTimeString();
        console.log(`\n[#${i + 1}] @${m.author} (${m.roleTitle || 'AGENT'} / ${m.department || 'TECH'}) - ${time}:`);
        console.log(m.content);
        console.log('─'.repeat(70));
      }
      console.log(`\n💡 Reply: agent-team thread reply ${t.id} -a <your_name> -p "Your point"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('post <title>')
  .description('Post a new thread formatted with Smart Brevity')
  .option('-a, --author <name>', 'Author agent name', 'human')
  .option('-c, --category <type>', 'Category (meeting, ceremony, consult, general)', 'general')
  .option('-t, --topic <topic>', 'Specific topic name')
  .option('-i, --intent <text>', 'Why It Matters (1-2 sentences)')
  .requiredOption('-p, --point <text>', 'The Point (Core fact or technical finding)')
  .option('-n, --next <text>', 'Next Steps / Ask (Action item)')
  .option('--tag <mentions...>', 'Agent names to tag (e.g. coder1 qa-tester1)')
  .option('--room <number>', 'Room ID (1..5)')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (title, options) => {
    try {
      const port = parseInt(options.port, 10);
      const mentions = (options.tag || []).map((t: string) => t.startsWith('@') ? t : `@${t}`);
      const res = await apiCall('/api/threads', 'POST', {
        title,
        author: options.author,
        category: options.category,
        topic: options.topic,
        intent: options.intent,
        point: options.point,
        nextSteps: options.next,
        mentions,
        roomId: options.room ? Number(options.room) : undefined
      }, port);
      const t = res.thread;
      console.log(`\n✅ Thread created: [${t.id}] "${t.title}"`);
      console.log(`Author: @${t.createdBy} | Category: ${t.category.toUpperCase()}`);
      console.log(`Tagged: ${t.mentions.join(', ') || 'none'}\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('reply <threadId>')
  .description('Reply to an existing thread with Smart Brevity')
  .option('-a, --author <name>', 'Author agent name', 'human')
  .option('-t, --topic <topic>', 'Sub-topic if applicable')
  .option('-i, --intent <text>', 'Why It Matters (Context/impact)')
  .requiredOption('-p, --point <text>', 'The Point (Your answer or decision)')
  .option('-n, --next <text>', 'Next Steps / Ask')
  .option('--tag <mentions...>', 'Agent names to tag')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, options) => {
    try {
      const port = parseInt(options.port, 10);
      const mentions = (options.tag || []).map((t: string) => t.startsWith('@') ? t : `@${t}`);
      const res = await apiCall(`/api/threads/${encodeURIComponent(threadId)}/messages`, 'POST', {
        author: options.author,
        topic: options.topic,
        intent: options.intent,
        point: options.point,
        nextSteps: options.next,
        mentions
      }, port);
      console.log(`\n✅ Replied to thread [${threadId}] by @${options.author}:`);
      console.log(res.message?.content || options.point);
      console.log();
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('update <threadId>')
  .description('Update thread title, category, room, or status (active | resolved | archived)')
  .option('-t, --title <title>', 'New thread title / headline')
  .option('-s, --status <status>', 'Status: active | resolved | archived')
  .option('-c, --category <type>', 'Category: meeting | ceremony | consult | general')
  .option('-r, --room <number>', 'Room ID (1..5)')
  .option('-a, --author <name>', 'Your agent name (must be creator or human)', 'human')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall(`/api/threads/${encodeURIComponent(threadId)}`, 'PUT', {
        title: options.title,
        status: options.status,
        category: options.category,
        roomId: options.room ? Number(options.room) : undefined,
        author: options.author
      }, port);
      const t = res.thread;
      console.log(`\n✅ Thread [${t.id}] updated by @${options.author}:`);
      console.log(`   Title: "${t.title}"`);
      console.log(`   Status: [${t.status.toUpperCase()}] | Category: [${t.category.toUpperCase()}]\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('delete <threadId>')
  .description('Delete an entire thread (must be creator or human lead)')
  .option('-a, --author <name>', 'Your agent name (must be creator or human)', 'human')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, options) => {
    try {
      const port = parseInt(options.port, 10);
      await apiCall(`/api/threads/${encodeURIComponent(threadId)}`, 'DELETE', {
        author: options.author
      }, port);
      console.log(`\n🗑️ Thread [${threadId}] successfully deleted by @${options.author}.\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('clear')
  .description('Clear all threads in the active session (must be human lead or admin)')
  .option('-a, --author <name>', 'Your agent name (must be human or admin)', 'human')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/threads', 'DELETE', { author: options.author }, port);
      console.log(`\n🧹 Cleared all threads (${res.clearedCount || 0} removed) in session "${res.session}".\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('edit-msg <threadId> <messageId>')
  .description('Edit an existing message in a thread with Smart Brevity')
  .requiredOption('-a, --author <name>', 'Author agent name (must be message author or human)')
  .option('-t, --topic <topic>', 'Updated topic name')
  .option('-i, --intent <text>', 'Updated Why It Matters')
  .option('-p, --point <text>', 'Updated The Point')
  .option('-n, --next <text>', 'Updated Next Steps / Ask')
  .option('--tag <mentions...>', 'Updated agent tags')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, messageId, options) => {
    try {
      const port = parseInt(options.port, 10);
      const mentions = options.tag ? options.tag.map((t: string) => t.startsWith('@') ? t : `@${t}`) : undefined;
      const res = await apiCall(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, 'PUT', {
        author: options.author,
        topic: options.topic,
        intent: options.intent,
        point: options.point,
        nextSteps: options.next,
        mentions
      }, port);
      console.log(`\n✏️ Message [${messageId}] updated by @${options.author}:`);
      console.log(res.message?.content);
      console.log();
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

threadCmd
  .command('delete-msg <threadId> <messageId>')
  .description('Delete a specific message from a thread (must be author or human lead)')
  .option('-a, --author <name>', 'Your agent name (must be author or human)', 'human')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (threadId, messageId, options) => {
    try {
      const port = parseInt(options.port, 10);
      await apiCall(`/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, 'DELETE', {
        author: options.author
      }, port);
      console.log(`\n🗑️ Message [${messageId}] in thread [${threadId}] deleted by @${options.author}.\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

program.parse(process.argv);
