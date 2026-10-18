import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startServer } from '../server/server.js';

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

async function apiCall(endpoint: string, method: string = 'GET', body?: any, port: number = DEFAULT_PORT): Promise<any> {
  await ensureServer(port);
  const res = await fetch(`${getBaseUrl(port)}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
  .version('1.0.0');

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
  .description('Check real-time meeting room occupancy (Rooms 1-5, max 8 seats/room) and waiting queue')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (roomNumber, options) => {
    try {
      const port = parseInt(options.port, 10);
      const query = roomNumber ? `?roomId=${roomNumber}` : '';
      const data = await apiCall(`/api/meeting-rooms/status${query}`, 'GET', undefined, port);

      console.log('\n🏢 MEETING ROOMS & RESERVATION STATUS (Capacity: 8 seats per room)');
      console.log('═'.repeat(88));
      console.log(`${'ROOM'.padEnd(6)} | ${'NAME'.padEnd(20)} | ${'STATUS'.padEnd(14)} | ${'SEATS'.padEnd(7)} | TOPIC / ATTENDEES`);
      console.log('─'.repeat(88));

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

        console.log(`${roomLabel.padEnd(6)} | ${r.name.padEnd(20)} | ${statusBadge.padEnd(14)} | ${seatStr.padEnd(7)} | ${topicStr}${attendeesStr}`);
      }
      console.log('═'.repeat(88));

      if (data.queue && data.queue.length > 0) {
        console.log(`\n⏳ MEETING WAITING QUEUE (${data.queue.length} meeting request${data.queue.length > 1 ? 's' : ''} waiting):`);
        console.log('─'.repeat(88));
        data.queue.forEach((q: any, idx: number) => {
          const roomTarget = q.targetRoomId ? `Room ${q.targetRoomId}` : 'First Free Room';
          const waitMins = Math.round((Date.now() - q.queuedAt) / 1000 / 60);
          const timeStr = waitMins === 0 ? 'just now' : `${waitMins}m ago`;
          console.log(`  #${idx + 1} [${q.id}] Target: ${roomTarget.padEnd(16)} | Topic: "${q.topic}"`);
          console.log(`     Waiting Agents: [${q.names.join(', ')}] (Queued: ${timeStr})`);
        });
        console.log('─'.repeat(88));
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
  .description('Move agents to a meeting room (1-5). If full (8 seats), automatically queues request.')
  .option('-r, --room <number>', 'Meeting room number (1 to 5)', '1')
  .option('-t, --topic <topic>', 'Meeting topic/agenda')
  .option('--no-queue', 'Do not place in queue if full, abort instead')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (names, options) => {
    try {
      const port = parseInt(options.port, 10);
      const room = Math.max(1, Math.min(5, parseInt(options.room, 10) || 1));
      const forceQueue = options.queue !== false;
      const res = await apiCall('/api/agents/meet', 'POST', { names, topic: options.topic, room, forceQueue }, port);

      if (res.queued) {
        console.log(`\n⚠️  [Meeting Room ${room}] is currently FULL (8/8 seats occupied)!`);
        console.log(`⏳ Agents [${names.join(', ')}] placed in WAITING QUEUE:`);
        console.log(`   - Queue ID: ${res.queueItem?.id}`);
        console.log(`   - Position: #${res.position} in line`);
        console.log(`   - Topic: "${options.topic || `Meeting Room ${room}`}"`);
        console.log(`💡 They will wait at their desks and automatically enter Room ${room} once the current meeting finishes.`);
        console.log(`💡 Check queue status anytime: "agent-team room-status"\n`);
      } else {
        console.log(`📋 Meeting started in [Meeting Room ${room}]: "${options.topic || `Meeting Room ${room}`}" with [${names.join(', ')}]`);
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
  .option('-r, --room <number>', 'Specific meeting room number (1 to 5, or omit for first available)')
  .option('-t, --topic <topic>', 'Meeting topic/agenda')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (names, options) => {
    try {
      const port = parseInt(options.port, 10);
      const room = options.room ? Math.max(1, Math.min(5, parseInt(options.room, 10))) : undefined;
      const res = await apiCall('/api/meeting-rooms/queue', 'POST', { names, topic: options.topic, room }, port);
      const targetStr = room ? `Room ${room}` : 'Any Available Room';
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
  .description('End meeting - agents in meeting room disappear (specify room number 1-5 or agent names)')
  .option('-r, --room <number>', 'Specific meeting room number (1 to 5)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (args, options) => {
    try {
      const port = parseInt(options.port, 10);
      let targetRoom = options.room ? parseInt(options.room, 10) : undefined;
      let names: string[] = [];

      // Check if first arg is a room number
      if (args && args.length > 0) {
        if (/^[1-5]$/.test(args[0]) && !targetRoom) {
          targetRoom = parseInt(args[0], 10);
          names = args.slice(1);
        } else {
          names = args;
        }
      }

      const res = await apiCall('/api/agents/end-meeting', 'POST', { room: targetRoom, names: names.length > 0 ? names : undefined }, port);
      const removedNames = res.removed.map((a: any) => a.name).join(', ') || 'none';
      const roomDesc = targetRoom ? `Meeting Room ${targetRoom}` : 'All Meeting Rooms';
      console.log(`🚪 [${roomDesc}] ended. Agents disappeared: [${removedNames}]`);
      if (res.autoAdmitted) {
        console.log(`\n🎉 AUTO-ADMITTED NEXT QUEUE INTO ROOM ${res.autoAdmitted.roomId}:`);
        console.log(`   - Queue ID: ${res.autoAdmitted.queueItem.id}`);
        console.log(`   - Topic: "${res.autoAdmitted.queueItem.topic}"`);
        console.log(`   - Agents: [${res.autoAdmitted.queueItem.names.join(', ')}]`);
        console.log(`   💡 Meeting is now active in Room ${res.autoAdmitted.roomId}!\n`);
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

// POTATO-LIST COMMAND
program
  .command('potato-list')
  .description('List all discovered Potato-Skill agents (/Users/kittisak/workspace/potato-skill/agents)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const agents: any[] = await apiCall('/api/potato-agents', 'GET', undefined, port);
      console.log(`\n🥔 POTATO-SKILL AGENTS (${agents.length} available):`);
      console.log('---------------------------------------------------------------------------------------------------');
      console.log(`${'ROLE'.padEnd(18)} | ${'COLOR'.padEnd(8)} | ${'DEFAULT BENCH'.padEnd(16)} | DESCRIPTION`);
      console.log('---------------------------------------------------------------------------------------------------');
      for (const a of agents) {
        const benchName = `Bench ${a.targetBench + 1}`;
        console.log(`${a.name.padEnd(18)} | ${a.color.padEnd(8)} | ${benchName.padEnd(16)} | ${a.description.substring(0, 50)}...`);
      }
      console.log('---------------------------------------------------------------------------------------------------\n');
      console.log('💡 Quick command: "agent-team spawn-potato" to spawn the full squad into the office!\n');
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

// SPAWN-POTATO COMMAND
program
  .command('spawn-potato [roles...]')
  .description('Spawn Potato-Skill agents (e.g. "coder", "qa-tester" or omit to spawn all 10)')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (roles, options) => {
    try {
      const port = parseInt(options.port, 10);
      if (!roles || roles.length === 0 || roles.includes('all') || roles.includes('team')) {
        const res = await apiCall('/api/potato-agents/spawn-squad', 'POST', undefined, port);
        console.log(`🥔 Spawned full Potato Squad (${res.count} agents) across the Startup Benches!`);
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
        console.log(`📋 Potato Workflow [review]: coder1 & code-reviewer1 are in Room 1!`);
      } else if (wf === 'arch') {
        await apiCall('/api/agents/meet', 'POST', { names: ['product-manager1', 'system-architect1'], room: 2, topic: 'PRD to Architecture Contract' }, port);
        console.log(`📋 Potato Workflow [arch]: product-manager1 & system-architect1 are in Room 2!`);
      } else if (wf === 'qa') {
        await apiCall('/api/agents/meet', 'POST', { names: ['qa-tester1', 'devops-release1'], room: 3, topic: 'QA Attestation & Canary Rollout' }, port);
        console.log(`📋 Potato Workflow [qa]: qa-tester1 & devops-release1 are in Room 3!`);
      } else if (wf === 'triage') {
        await apiCall('/api/agents/meet', 'POST', { names: ['runtime-sre1', 'coder1'], room: 4, topic: 'Runtime Incident RCA & Hotfix' }, port);
        console.log(`📋 Potato Workflow [triage]: runtime-sre1 & coder1 are in Room 4!`);
      } else if (wf === 'all-hands') {
        const team = ['project-planner1', 'product-manager1', 'system-architect1', 'coder1', 'code-reviewer1', 'qa-tester1', 'devops-release1', 'runtime-sre1'];
        await apiCall('/api/agents/meet', 'POST', { names: team, room: 5, topic: 'Sprint DAG Wave Planning' }, port);
        console.log(`📋 Potato Workflow [all-hands]: Full squad (8 agents) in Room 5 Boardroom!`);
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
  .description('Manage Agile Sprint Ceremonies: 1.validation | 2.grooming | 3.planning | 4.working | 5.demo | 6.retro');

sprintCmd
  .command('start [sprintNumber] [storyParts...]')
  .description('Start a new Sprint with story ticket and story points')
  .option('-p, --points <number>', 'Story points estimation (default: 5)', '5')
  .option('--port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (sprintNumber, storyParts, options) => {
    try {
      const port = parseInt(options.port, 10);
      const num = sprintNumber && /^\d+$/.test(sprintNumber) ? parseInt(sprintNumber, 10) : undefined;
      const story = Array.isArray(storyParts) && storyParts.length > 0 ? storyParts.join(' ') : (!num && sprintNumber ? sprintNumber : undefined);
      const points = parseInt(options.points, 10) || 5;

      const res = await apiCall('/api/sprint/start', 'POST', { sprintNumber: num, story, points }, port);
      console.log(`\n🏃 SPRINT #${res.sprint.sprintNumber} STARTED!`);
      console.log(`📋 Story Card: "${res.sprint.story}" (${res.sprint.storyPoints} pts)`);
      console.log(`📊 Phase: ${res.sprint.phase.toUpperCase()}`);
      console.log(`\n💡 Next step: Run "agent-team sprint ceremony validation" or "agent-team sprint next"\n`);
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
    }
  });

sprintCmd
  .command('ceremony <phase>')
  .alias('run')
  .description('Run a Sprint Ceremony: 1.validation | 2.grooming | 3.planning | 4.working | 5.demo | 6.retro')
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
  .description('Advance to the next Sprint Ceremony in sequence (1 -> 2 -> 3 -> 4 -> 5 -> 6)')
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
        { idx: 5, key: 'demo', name: '5. Demo+UAT' },
        { idx: 6, key: 'retro', name: '6. Retro' }
      ];

      console.log(`\n══════════════════════════════════════════════════════════════════════`);
      console.log(`🏃 SPRINT #${s.sprintNumber} STATUS REPORT`);
      console.log(`══════════════════════════════════════════════════════════════════════`);
      console.log(`📋 Story Card:   "${s.story}"`);
      console.log(`🎯 Story Points:  ${s.storyPoints || 'Not estimated'} pts`);
      console.log(`📍 Current Phase: ${s.phase.toUpperCase()} (${s.phaseIndex}/6)`);
      console.log(`\n📈 SPRINT PIPELINE:`);
      const badges = CEREMONIES.map(c => {
        if (c.idx < s.phaseIndex) return `[✅ ${c.name}]`;
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
    const port = parseInt(options.port, 10);
    const story = storyParts && storyParts.length > 0 ? storyParts.join(' ') : undefined;
    if (story) await apiCall('/api/sprint/start', 'POST', { story }, port);
    const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'validation' }, port);
    console.log(`\n🎉 SPRINT CEREMONY #1: STORY VALIDATION & REFINEMENT`);
    console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
  });

program
  .command('groom [points]')
  .description('Shortcut: Run Ceremony 2 - Backlog Grooming & Point Estimation')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (points, options) => {
    const port = parseInt(options.port, 10);
    const pts = points ? parseInt(points, 10) : undefined;
    const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'grooming', points: pts }, port);
    console.log(`\n🎉 SPRINT CEREMONY #2: BACKLOG GROOMING & POINT ESTIMATION`);
    console.log(`🎯 Estimated: ${res.sprint.storyPoints} Story Points`);
    console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
  });

program
  .command('plan')
  .description('Shortcut: Run Ceremony 3 - Sprint Planning & Task Distribution in Boardroom')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'planning' }, port);
    console.log(`\n🎉 SPRINT CEREMONY #3: SPRINT PLANNING & TASK DISTRIBUTION`);
    console.log(`🏢 Location: Meeting Room ${res.ceremony.room} (Boardroom) with [${res.ceremony.attendees.join(', ')}]`);
  });

program
  .command('demo')
  .description('Shortcut: Run Ceremony 5 - Sprint Demo & UAT Acceptance')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'demo' }, port);
    console.log(`\n🎉 SPRINT CEREMONY #5: SPRINT DEMO & UAT ACCEPTANCE`);
    console.log(`🏢 Location: Meeting Room ${res.ceremony.room} with [${res.ceremony.attendees.join(', ')}]`);
  });

program
  .command('retro')
  .description('Shortcut: Run Ceremony 6 - Sprint Retrospective in Boardroom')
  .option('-p, --port <number>', 'Server port', String(DEFAULT_PORT))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const res = await apiCall('/api/sprint/ceremony', 'POST', { phase: 'retro' }, port);
    console.log(`\n🎉 SPRINT CEREMONY #6: SPRINT RETROSPECTIVE (LESSONS LEARNED)`);
    console.log(`🏢 Location: Meeting Room ${res.ceremony.room} (Boardroom) with [${res.ceremony.attendees.join(', ')}]`);
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

program.parse(process.argv);
