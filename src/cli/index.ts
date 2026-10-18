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

function resolveSession(sessionArg?: string): string {
  if (sessionArg && typeof sessionArg === 'string' && sessionArg.trim()) {
    return sessionArg.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }
  const envSession = process.env.AGENT_TEAM_SESSION || process.env.CLAUDE_PROJECT_DIR;
  if (envSession && envSession.trim()) {
    return envSession.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
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

// ASK / VISIT COMMAND (Walk to another desk for consultation)
program
  .command('ask <from> <to> [question...]')
  .alias('visit')
  .alias('consult')
  .alias('walk-to')
  .alias('talk-to')
  .description('Send an agent walking over to another agent\'s desk to ask information or consult')
  .option('-r, --reply <reply>', 'Explicit answer/reply from the target agent')
  .option('-d, --duration <seconds>', 'Duration of consultation before returning (default: 12, 0 to stay)', '12')
  .option('--stay', 'Stay at the target desk until "agent-team return" is called')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (from, to, questionParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const question = questionParts && questionParts.length > 0
        ? questionParts.join(' ')
        : 'Hey, do you have a minute to sync on this?';
      const duration = options.stay ? 0 : parseInt(options.duration, 10) || 12;

      const res = await apiCall('/api/agents/visit', 'POST', {
        from,
        to,
        question,
        reply: options.reply,
        duration
      }, port);

      const targetDesk = Math.floor(res.target.slot / 8) + 1;
      const targetSeat = (res.target.slot % 8) + 1;

      console.log(`\n🚶 [${res.visitor.name}] is walking over to [${res.target.name}]'s desk (Desk ${targetDesk}, Seat ${targetSeat})...`);
      console.log(`❓ [${res.visitor.name}] asks: "${res.visit.question}"`);
      if (res.visit.reply) {
        console.log(`💡 [${res.target.name}] replies: "${res.visit.reply}"`);
      }
      if (duration > 0) {
        console.log(`⏱️ [${res.visitor.name}] will consult for ${duration}s, then walk back to their desk.`);
      } else {
        console.log(`📌 [${res.visitor.name}] will stay at the desk until you run: "agent-team return ${res.visitor.name}".`);
      }
      console.log('');
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
  .description('Run a predefined Potato-Skill meeting workflow: review | arch | qa | triage | all-hands')
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
        const team = ['project-planner1', 'product-manager1', 'system-architect1', 'coder1', 'code-reviewer1', 'qa-tester1', 'devops-release1', 'runtime-sre1'];
        await apiCall('/api/agents/meet', 'POST', { names: team, room: 5, topic: 'Sprint DAG Wave Planning' }, port);
        console.log(`📋 Potato Workflow [all-hands]: Full squad (8 agents) in Infinity Boardroom (∞)!`);
      } else {
        console.log(`Unknown workflow "${workflow}". Available: review | arch | qa | triage | all-hands`);
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
  .description('Advance to the next Sprint Ceremony in sequence (1 -> 8)')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sprint/next', 'POST', undefined, port);
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
program
  .command('sessions')
  .alias('session-list')
  .description('List all project directory sessions and their status')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const res = await apiCall('/api/sessions', 'GET', undefined, port);
      const current = resolveSession(program.opts().session);
      console.log(`\n📁 ACTIVE PROJECT SESSIONS (Current: "${current}")`);
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
      console.log(`💡 Switch project session with: "agent-team -S <session> <command>" or select in Web UI at http://localhost:${port}\n`);
    } catch (err: any) {
      console.error(`❌ Failed to list sessions: ${err.message}`);
    }
  });

program
  .command('session-current')
  .description('Print the currently active session name (derived from current project dir or env)')
  .action(() => {
    const session = resolveSession(program.opts().session);
    console.log(`📁 Current directory session: "${session}" (from directory "${path.basename(process.cwd())}")`);
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

program.parse(process.argv);
