import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MEETING_ROOMS, resolveRoomId } from '../server/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = parseInt(process.env.AGENT_TEAM_PORT || '3333', 10);

function getBaseUrl(port: number = DEFAULT_PORT): string {
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

  console.error(`[agent-team MCP] Server is not running on port ${port}. Starting background daemon...`);
  const serverPath = path.resolve(__dirname, '../server/standalone.js');
  const tsServerPath = path.resolve(__dirname, '../../src/server/standalone.ts');
  const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx');

  const outLog = fs.openSync('/tmp/agent-team.log', 'a');
  const errLog = fs.openSync('/tmp/agent-team.err.log', 'a');

  let child;
  if (fs.existsSync(serverPath)) {
    child = spawn(process.execPath, [serverPath, String(port)], {
      detached: true,
      stdio: ['ignore', outLog, errLog],
      env: { ...process.env, AGENT_TEAM_PORT: String(port) }
    });
  } else {
    child = spawn(process.execPath, [tsxBin, tsServerPath, String(port)], {
      detached: true,
      stdio: ['ignore', outLog, errLog],
      env: { ...process.env, AGENT_TEAM_PORT: String(port) }
    });
  }
  child.unref();

  const start = Date.now();
  while (Date.now() - start < 3500) {
    await new Promise(r => setTimeout(r, 200));
    if (await isServerRunning(port)) {
      console.error(`[agent-team MCP] Server started at ${getBaseUrl(port)}`);
      return;
    }
  }
  console.error(`[agent-team MCP] Warning: Server launch initiated, but port ${port} is not yet responding.`);
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
  const resolvedSession = resolveSession(session || (body && body.session));
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

export function createOfficeMcpServer(): McpServer {
  const server = new McpServer({
    name: 'agent-team',
    version: '1.0.0'
  });

  // SPRINT CEREMONY GOVERNANCE PROMPT
  server.prompt(
    'sprint_ceremony_governance',
    'Mandatory Sprint Ceremony Policy: Forces Claude and all agents to follow the 8-phase sprint workflow strictly.',
    {},
    () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `MANDATORY SPRINT CEREMONY GOVERNANCE FOR ALL AGENTS:
When coordinating agents or developing features, every agent MUST strictly follow the 8 Sprint Ceremonies in sequence:
1. validation: PO brings story to Dev/Architect in Room 2 to validate feasibility and refine AC.
2. grooming: Dev, QA, Reviewer, Architect, PO meet in Room 1 to examine edge cases and estimate story points.
3. planning: All squad leads assemble in Room 5 Boardroom to decompose task DAG waves and distribute work.
4. working: All agents code at their designated desks with typing animations and live progress updates.
5. demo: Dev team conducts live feature demonstration in Room 3 to PO and stakeholders.
6. uat: PO and QA conduct formal Acceptance Criteria verification in Room 2. Formal sign-off is MANDATORY.
7. release: DevOps and SRE deploy release artifact to production in Room 4 with automated canary verification.
8. retro: All agents assemble in Room 5 Boardroom to analyze issues and log continuous improvements.

STRICT RULES:
- Never write production code before Validation, Grooming, and Planning.
- Never release to production without formal UAT Sign-Off.
- Advance sequentially using "office_sprint_next" or "office_sprint_ceremony".`
        }
      }]
    })
  );

  // 1. SET WORK
  server.tool(
    'office_set_work',
    'Set an agent to work on a task with optional progress percentage (0-100). Auto-spawns the agent at their designated desk if not yet present. (NOTE: Per sprint governance policy, active feature coding is conducted during Phase 4: working).',
    {
      agent_name: z.string().describe('Name of the agent (e.g. coder1, pm1, qa1, devops1)'),
      task: z.string().describe('Description of the task being performed'),
      progress: z.number().min(0).max(100).optional().describe('Progress percentage (0-100, default 25)')
    },
    async ({ agent_name, task, progress }) => {
      const res = await apiCall('/api/agents/work', 'POST', {
        name: agent_name,
        task,
        progress: progress ?? 25
      });
      return {
        content: [{
          type: 'text',
          text: `💻 Agent [${res.agent.name}] is now WORKING (${res.agent.progress}%): "${res.agent.task}" at Desk ${res.agent.desk.benchNumber + 1}, Seat ${res.agent.desk.seatIndex + 1}`
        }]
      };
    }
  );

  // 2. UPDATE PROGRESS
  server.tool(
    'office_update_progress',
    'Update progress percentage (0-100) and optionally update the task description for an active agent.',
    {
      agent_name: z.string().describe('Name of the agent'),
      progress: z.number().min(0).max(100).describe('New progress percentage (0-100)'),
      task: z.string().optional().describe('Optional updated task description')
    },
    async ({ agent_name, progress, task }) => {
      const res = await apiCall('/api/agents/progress', 'POST', {
        name: agent_name,
        progress,
        task
      });
      return {
        content: [{
          type: 'text',
          text: `📊 Agent [${res.agent.name}] progress updated to ${res.agent.progress}%: "${res.agent.task}"`
        }]
      };
    }
  );

  // 3. DESK VISIT (ASK / CONSULT)
  server.tool(
    'office_desk_visit',
    "Have an agent get up from their desk, walk along aisles and hallways to another agent's desk to ask a question or consult. Displays 8-bit walking animation, question bubble, and reply bubble.",
    {
      from_agent: z.string().describe('Agent who gets up and walks to consult (e.g. pm1)'),
      to_agent: z.string().describe('Target agent being visited (e.g. coder1)'),
      question: z.string().describe('Question to ask at the desk'),
      reply: z.string().optional().describe('Optional custom reply from the target agent. If omitted, target will automatically reply based on their current task.'),
      duration: z.number().optional().describe('Duration in seconds to consult before walking back (default 12)'),
      stay: z.boolean().optional().describe('If true, visitor stays at desk until office_return_to_desk is called')
    },
    async ({ from_agent, to_agent, question, reply, duration, stay }) => {
      const res = await apiCall('/api/agents/visit', 'POST', {
        from: from_agent,
        to: to_agent,
        question,
        reply,
        duration: duration ?? 12,
        stay: !!stay
      });
      const v = res.visit;
      const visitorName = v.visitorName || from_agent;
      const targetName = v.targetName || to_agent;
      return {
        content: [{
          type: 'text',
          text: `🚶 [${visitorName}] is walking over to [${targetName}]'s desk.\n❓ Question: "${v.question}"\n💡 Reply: "${v.reply}"\n${stay ? `📌 Staying until office_return_to_desk is called.` : `⏱️ Will auto-return in ${v.durationSec}s.`}`
        }]
      };
    }
  );

  // 4. RETURN TO DESK
  server.tool(
    'office_return_to_desk',
    'Order an agent who is currently visiting another desk to walk back to their own desk and resume working.',
    {
      agent_name: z.string().describe('Name of the visiting agent to return (e.g. pm1)')
    },
    async ({ agent_name }) => {
      await apiCall('/api/agents/return', 'POST', { name: agent_name });
      return {
        content: [{
          type: 'text',
          text: `🚶 Agent [${agent_name}] is walking back to their home desk!`
        }]
      };
    }
  );

  // 5. START MEETING
  server.tool(
    'office_start_meeting',
    'Move agents into a conference suite (Room 1-5: Sigma, Delta, Lambda, Omega, Infinity, capacity 8). If room is full (8/8), automatically places them into the Waiting Queue.',
    {
      agents: z.array(z.string()).describe('List of agent names to join meeting (e.g. ["coder1", "reviewer1"])'),
      room: z.union([z.number(), z.string()]).default(1).describe('Conference room: 1-5, or symbol/name (sigma, delta, lambda, omega, infinity, Σ, Δ, λ, Ω, ∞)'),
      topic: z.string().optional().describe('Topic of the meeting')
    },
    async ({ agents, room, topic }) => {
      const resolvedRoom = resolveRoomId(room) || 1;
      const roomInfo = MEETING_ROOMS[resolvedRoom];
      const roomName = roomInfo ? roomInfo.fullName : `Room ${resolvedRoom}`;
      const res = await apiCall('/api/agents/meet', 'POST', {
        names: agents,
        room: resolvedRoom,
        topic
      });
      if (res.queued) {
        return {
          content: [{
            type: 'text',
            text: `⏳ ${roomName} is FULL (8/8). Agents [${res.queueItem?.names?.join(', ') || agents.join(', ')}] placed in WAITING QUEUE #${res.position} (ID: ${res.queueItem?.id}). They will auto-admit when room is freed!`
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: `📋 Meeting started in ${roomName}: "${topic || roomName}" with attendees: [${agents.join(', ')}] (${agents.length}/8 seats).`
        }]
      };
    }
  );

  // 6. END MEETING
  server.tool(
    'office_end_meeting',
    'End a meeting in a conference suite (Sigma, Delta, Lambda, Omega, Infinity). Attendees leave with 8-bit smoke puff effect. Automatically admits any team waiting in queue!',
    {
      room: z.union([z.number(), z.string()]).optional().describe('Specific room: 1-5, or symbol/name (sigma, delta, lambda, omega, infinity, Σ, Δ, λ, Ω, ∞). If omitted, ends meetings in all rooms.')
    },
    async ({ room }) => {
      const resolvedRoom = resolveRoomId(room);
      const res = await apiCall('/api/agents/end-meeting', 'POST', { room: resolvedRoom });
      const roomDesc = resolvedRoom ? (MEETING_ROOMS[resolvedRoom]?.fullName || `Room ${resolvedRoom}`) : 'All Conference Suites';
      let text = `🚪 [${roomDesc}] ended. ${res.removed?.length || 0} agents disappeared.`;
      if (res.autoAdmitted) {
        const admittedRoomName = MEETING_ROOMS[res.autoAdmitted.roomId]?.fullName || `Room ${res.autoAdmitted.roomId}`;
        text += `\n🎉 Queue item [${res.autoAdmitted.queueItem.id}] Auto-Admitted into ${admittedRoomName.toUpperCase()}: [${res.autoAdmitted.queueItem.names.join(', ')}] ("${res.autoAdmitted.queueItem.topic}")`;
      }
      return {
        content: [{ type: 'text', text }]
      };
    }
  );

  // 7. GET STATUS
  server.tool(
    'office_get_status',
    'Get full office roster, desk locations, progress, conference room occupancy (1-5), waiting queues, and active desk visits.',
    {},
    async () => {
      const res = await apiCall('/api/agents', 'GET');
      const roomStatus = await apiCall('/api/meeting-rooms/status', 'GET');
      const visits = await apiCall('/api/agents/visits', 'GET');

      const working = res.agents.filter((a: any) => a.status === 'working');
      const inMeet = res.agents.filter((a: any) => a.status === 'meeting');
      const visiting = res.agents.filter((a: any) => a.status === 'visiting' || a.status === 'walking');

      const lines = [
        `🏢 8-BIT VIRTUAL OFFICE STATUS:`,
        `Active Agents: ${res.agents.length} (Working: ${working.length}, In Meetings: ${inMeet.length}, Visiting: ${visiting.length})`,
        ``,
        `📋 Conference Rooms:`,
        ...roomStatus.rooms.map((r: any) => {
          const statusText = r.isFull ? 'FULL (8/8)' : (r.isOccupied ? 'IN USE' : 'AVAILABLE');
          return `  - RM ${r.roomId} (${r.name}): ${statusText} [${r.attendees.length}/${r.capacity}] ${r.topic ? `"${r.topic}" -> [${r.attendees.join(', ')}]` : ''}`;
        }),
        ``,
        `⏳ Waiting Queues: ${roomStatus.queue.length} request(s) waiting`,
        ...roomStatus.queue.map((q: any) =>
          `  #${q.position} [${q.id}] Target: Room ${q.targetRoom} | Topic: "${q.topic}" | Agents: [${q.names.join(', ')}]`
        ),
        ``,
        `🚶 Active Desk Visits: ${visits.visits.length}`,
        ...visits.visits.map((v: any) =>
          `  - [${v.from}] visiting [${v.to}]: Q: "${v.question}" -> A: "${v.reply}"`
        ),
        ``,
        `💻 Active Roster:`,
        ...res.agents.map((a: any) =>
          `  - ${a.name.padEnd(16)} | Status: ${a.status.padEnd(9)} | Progress: ${String(a.progress ?? 0).padStart(3)}% | Task: "${a.task || 'None'}"`
        )
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  // 8. DISMISS AGENTS
  server.tool(
    'office_dismiss',
    'Dismiss agents from the office with an 8-bit smoke puff animation when their task is finished.',
    {
      agents: z.array(z.string()).optional().describe('List of agent names to dismiss'),
      idle: z.boolean().optional().describe('If true, dismisses all idle agents'),
      sleeping: z.boolean().optional().describe('If true, dismisses all sleeping agents')
    },
    async ({ agents, idle, sleeping }) => {
      const res = await apiCall('/api/agents/remove', 'POST', {
        names: agents,
        idle: !!idle,
        sleeping: !!sleeping
      });
      return {
        content: [{
          type: 'text',
          text: `💨 Removed ${res.removedCount} agent(s): [${res.removed.join(', ')}]`
        }]
      };
    }
  );

  // 9. SLEEP
  server.tool(
    'office_sleep',
    'Put an agent to sleep with floating Zzz animation.',
    {
      agent_name: z.string().describe('Name of the agent')
    },
    async ({ agent_name }) => {
      const res = await apiCall('/api/agents/sleep', 'POST', { name: agent_name });
      return {
        content: [{
          type: 'text',
          text: `💤 Agent [${res.agent.name}] is now sleeping.`
        }]
      };
    }
  );

  // 10. TALK
  server.tool(
    'office_talk',
    'Display a speech bubble above an agent.',
    {
      agent_name: z.string().describe('Name of the agent'),
      message: z.string().describe('Message to display in the speech bubble')
    },
    async ({ agent_name, message }) => {
      const res = await apiCall('/api/agents/talk', 'POST', { name: agent_name, message });
      return {
        content: [{
          type: 'text',
          text: `💬 [${res.agent.name}]: "${res.agent.message}"`
        }]
      };
    }
  );

  // 11. SPAWN POTATO SQUAD
  server.tool(
    'office_spawn_potato',
    'Spawn Potato-Skill agents (product-manager, coder, code-reviewer, qa-tester, system-architect, etc.) to their designated desks.',
    {
      roles: z.array(z.string()).optional().describe('Specific roles to spawn. If omitted, spawns the full 10-role squad.')
    },
    async ({ roles }) => {
      const allAgents: any[] = await apiCall('/api/potato-agents', 'GET');
      const targets = roles && roles.length > 0
        ? allAgents.filter((r: any) => roles.includes(r.name) || roles.includes(r.role))
        : allAgents;

      const spawned: string[] = [];
      for (const p of targets) {
        await apiCall('/api/agents/work', 'POST', {
          name: p.name,
          task: p.defaultTask || 'Executing task...',
          progress: 20
        });
        spawned.push(p.name);
      }

      return {
        content: [{
          type: 'text',
          text: `🤖 Spawned ${spawned.length} agent(s) from agents/ across the 5 Department workbenches: [${spawned.join(', ')}]`
        }]
      };
    }
  );

  // 11b. GET DEPARTMENTS STATUS
  server.tool(
    'office_get_departments',
    'Get real-time bench occupancy and seated agents across all 5 Startup Departments: 1.product | 2.designer | 3.tech (fe+be+qa) | 4.devops | 5.ai_data',
    {},
    async () => {
      const res = await apiCall('/api/departments', 'GET');
      const lines = [
        `🏢 TECH STARTUP DEPARTMENTS & BENCH ALLOCATION (40 workstations):`,
        ...res.departments.map((d: any) => {
          const occ = `[${d.occupancy}/8]`;
          const agentList = d.agents.length > 0 ? d.agents.map((a: any) => `${a.name}(${a.roleTitle || a.role})`).join(', ') : '(Empty bench)';
          return `  - Bench ${d.benchNumber} // ${d.name.padEnd(30)} ${occ} -> ${agentList}`;
        })
      ];
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  // 11c. SPAWN DEPARTMENT
  server.tool(
    'office_spawn_department',
    'Spawn agents directly into one of the 5 Startup Departments: product, designer, tech, devops, or ai_data',
    {
      department: z.enum(['product', 'designer', 'tech', 'devops', 'ai_data']).describe('Target department name'),
      count: z.number().min(1).max(8).optional().describe('Number of agents to spawn (1 to 8, default: 1)')
    },
    async ({ department, count }) => {
      const res = await apiCall('/api/departments/spawn', 'POST', { department, count: count ?? 1 });
      const names = res.agents.map((a: any) => `${a.name} (${a.roleTitle})`);
      return {
        content: [{
          type: 'text',
          text: `🏢 Spawned ${res.count} agent(s) into Department [${res.department}]: ${names.join(', ')}`
        }]
      };
    }
  );

  // 12. RESET / CLOCK-OUT
  server.tool(
    'office_reset',
    'Clock out / end shift for all agents: resets the entire office, sending everyone home, clearing desks, queues, and conference rooms.',
    {},
    async () => {
      await apiCall('/api/reset', 'POST');
      return {
        content: [{
          type: 'text',
          text: `🏠 Shift ended! All agents clocked out and went home. The office is clear and ready for tomorrow.`
        }]
      };
    }
  );

  // 13. SPRINT START
  server.tool(
    'office_sprint_start',
    'Start a new Sprint cycle. Story cards can be picked from Taskwarrior (default kanban backlog) or Jira, or provided manually. Defaults to Taskwarrior top pending card if no story or card_id is provided.',
    {
      sprint_number: z.number().optional().describe('Sprint number (e.g. 1, 2)'),
      card_id: z.string().optional().describe('Story card ID from Taskwarrior (e.g. "1") or Jira (e.g. "JIRA-101")'),
      source: z.enum(['taskwarrior', 'jira']).optional().describe('Story card source provider (default: taskwarrior)'),
      story: z.string().optional().describe('User story title (optional if card_id or Taskwarrior backlog is used)'),
      points: z.number().optional().describe('Story points estimation (default: card points or 5)')
    },
    async ({ sprint_number, card_id, source, story, points }) => {
      const res = await apiCall('/api/sprint/start', 'POST', {
        sprintNumber: sprint_number,
        cardId: card_id,
        source: source || 'taskwarrior',
        story,
        points
      });
      const cardBadge = res.sprint.sourceCard ? ` [${res.sprint.sourceCard.source.toUpperCase()}: ${res.sprint.sourceCard.id}]` : '';
      return {
        content: [{
          type: 'text',
          text: `🏃 SPRINT #${res.sprint.sprintNumber} INITIALIZED!\n📋 Story Card:${cardBadge} "${res.sprint.story}" (${res.sprint.storyPoints} pts)\n📍 Phase: ${res.sprint.phase.toUpperCase()}\n💡 Next: Run office_sprint_ceremony with phase: "validation" or run office_sprint_next.`
        }]
      };
    }
  );

  // 14. SPRINT CEREMONY
  server.tool(
    'office_sprint_ceremony',
    'Execute a specific Agile Sprint Ceremony: 1.validation (PO & Dev AC validation) | 2.grooming (Dev & QA point estimation) | 3.planning (Boardroom task distribution) | 4.working (All agents coding at desks) | 5.demo (Feature Demo) | 6.uat (UAT Verification & Formal Sign-Off) | 7.release (Production Release & Canary Rollout) | 8.retro (Retrospective & lessons learned)',
    {
      phase: z.enum(['validation', 'grooming', 'planning', 'working', 'demo', 'uat', 'release', 'retro']).describe('Ceremony phase to execute'),
      points: z.number().optional().describe('Story points (for grooming phase)'),
      topic: z.string().optional().describe('Custom meeting topic')
    },
    async ({ phase, points, topic }) => {
      const res = await apiCall('/api/sprint/ceremony', 'POST', { phase, points, topic });
      const c = res.ceremony;
      let text = `🎉 SPRINT CEREMONY #${c.phaseIndex}: ${c.name.toUpperCase()}\n📝 Description: ${c.description}\n🏷️ Topic: "${c.topic}"`;
      if (c.room) {
        const roomName = MEETING_ROOMS[c.room]?.fullName || `Meeting Room ${c.room}`;
        text += `\n🏢 Location: ${roomName}\n👥 Attendees: [${c.attendees.join(', ')}]`;
      } else {
        text += `\n💻 Location: Open-Space Workbenches (All agents actively coding at desks)`;
      }
      return {
        content: [{ type: 'text', text }]
      };
    }
  );

  // 15. SPRINT NEXT
  server.tool(
    'office_sprint_next',
    'Advance to the next Sprint Ceremony in sequence (1.validation -> 2.grooming -> 3.planning -> 4.working -> 5.demo -> 6.uat -> 7.release -> 8.retro).',
    {},
    async () => {
      const res = await apiCall('/api/sprint/next', 'POST');
      const c = res.ceremony;
      let text = `⏩ ADVANCED TO SPRINT CEREMONY #${c.phaseIndex}: ${c.name.toUpperCase()}\n📝 Description: ${c.description}\n🏷️ Topic: "${c.topic}"`;
      if (c.room) {
        const roomName = MEETING_ROOMS[c.room]?.fullName || `Meeting Room ${c.room}`;
        text += `\n🏢 Location: ${roomName}\n👥 Attendees: [${c.attendees.join(', ')}]`;
      } else {
        text += `\n💻 Location: Open-Space Workbenches (All agents coding at desks)`;
      }
      return {
        content: [{ type: 'text', text }]
      };
    }
  );

  // 16. SPRINT STATUS
  server.tool(
    'office_sprint_status',
    'Get current Sprint details, active ceremony, story points, and ceremony pipeline progress.',
    {},
    async () => {
      const res = await apiCall('/api/sprint', 'GET');
      const s = res.sprint;
      const CEREMONIES = [
        { idx: 1, name: '1. Validation' },
        { idx: 2, name: '2. Grooming' },
        { idx: 3, name: '3. Planning' },
        { idx: 4, name: '4. Work' },
        { idx: 5, name: '5. Demo' },
        { idx: 6, name: '6. UAT Sign-Off' },
        { idx: 7, name: '7. Release Prod' },
        { idx: 8, name: '8. Retro' }
      ];
      const badges = CEREMONIES.map(c => {
        if (c.idx < s.phaseIndex) return `[✅ ${c.name}]`;
        if (c.idx === s.phaseIndex) return `[▶️ ${c.name.toUpperCase()}]`;
        return `[⬜ ${c.name}]`;
      });

      const cardBadge = s.sourceCard ? ` [${s.sourceCard.source.toUpperCase()}: ${s.sourceCard.id}]` : '';
      const lines = [
        `🏃 SPRINT #${s.sprintNumber} STATUS REPORT:`,
        `📋 Story Card:  ${cardBadge} "${s.story}"`,
        `🎯 Story Points:  ${s.storyPoints || 'Not estimated'} pts`,
        `📍 Current Phase: ${s.phase.toUpperCase()} (${s.phaseIndex}/8)`,
        `📈 Pipeline:      ${badges.join(' ➔ ')}`
      ];

      if (s.activeCeremony) {
        lines.push(`🔔 Active Ceremony: "${s.activeCeremony.topic}"`);
        if (s.activeCeremony.room) {
          const roomName = MEETING_ROOMS[s.activeCeremony.room]?.fullName || `Room ${s.activeCeremony.room}`;
          lines.push(`   Location: ${roomName} | Attendees: [${s.activeCeremony.attendees.join(', ')}]`);
        }
      }

      if (s.completedSprints && s.completedSprints.length > 0) {
        lines.push(`\n🏆 Completed Sprints Archive (${s.completedSprints.length} sprints total):`);
        s.completedSprints.forEach((r: any) => {
          lines.push(`   ✨ Sprint #${r.sprintNumber}: "${r.story}" [${r.storyPoints || 5} pts]`);
        });
      }

      if (s.phase === 'completed') {
        lines.push(`\n🎉 Current sprint is COMPLETED! Call "office_sprint_start" to launch the next sprint cycle.`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  // 17. SPRINT COMPLETE
  server.tool(
    'office_sprint_complete',
    'Mark the current Sprint cycle as COMPLETED and archive it. MANDATORY: All 8 ceremonies including Phase 8 (Sprint Retrospective) must be finished before completing.',
    {
      summary: z.string().optional().describe('Optional retrospective summary or milestone conclusion notes')
    },
    async ({ summary }) => {
      const res = await apiCall('/api/sprint/complete', 'POST', { summary });
      const r = res.record;
      return {
        content: [{
          type: 'text',
          text: `🏆 SPRINT #${r.sprintNumber} COMPLETED & ARCHIVED!\n📋 Story: "${r.story}" (${r.storyPoints} pts)\n⏱️ Ceremonies: ${r.ceremoniesCount} phases executed\n📝 Summary: "${r.summary}"\n\n💡 Ready for the next sprint! Call "office_sprint_start" to begin Sprint #${r.sprintNumber + 1}.`
        }]
      };
    }
  );

  // 18. GET STORY CARDS (Taskwarrior default, or Jira)
  server.tool(
    'office_get_cards',
    'List story cards from the backlog. Defaults to Taskwarrior (local kanban), or Jira. Use these cards to feed into sprint ceremonies.',
    {
      source: z.enum(['taskwarrior', 'jira']).optional().describe('Backlog source provider: taskwarrior (default) or jira')
    },
    async ({ source }) => {
      const src = source || 'taskwarrior';
      const res = await apiCall(`/api/cards?source=${src}`, 'GET');
      const lines = [
        `📋 STORY CARDS BACKLOG [${src.toUpperCase()}] (${res.cards.length} cards):`,
        ...res.cards.map((c: any) => {
          const stat = c.status === 'done' ? '✅ DONE' : c.status === 'in_progress' ? '▶️ IN_PROG' : '⬜ TODO';
          const pts = c.points !== undefined ? `${c.points} pts` : '-';
          const pri = c.priority ? `[Pri: ${c.priority}]` : '';
          const tags = c.tags && c.tags.length > 0 ? `(${c.tags.join(', ')})` : '';
          return `  - #${c.id} | ${stat} | ${pts} ${pri} | "${c.title}" ${tags}`;
        }),
        ``,
        `💡 To start a sprint with a card: call office_sprint_start with card_id: "<id>" and source: "${src}"`
      ];
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  // 19. ADD STORY CARD
  server.tool(
    'office_add_card',
    'Add a new story card into the backlog (Taskwarrior kanban by default, or Jira).',
    {
      title: z.string().describe('Title of the user story card'),
      points: z.number().optional().describe('Story points estimation (default: 5)'),
      tags: z.array(z.string()).optional().describe('Tags/labels for the story card'),
      priority: z.enum(['H', 'M', 'L']).optional().describe('Priority level: H, M, or L'),
      source: z.enum(['taskwarrior', 'jira']).optional().describe('Target backlog provider (default: taskwarrior)')
    },
    async ({ title, points, tags, priority, source }) => {
      const src = source || 'taskwarrior';
      const res = await apiCall('/api/cards/add', 'POST', {
        title,
        points: points ?? 5,
        tags,
        priority,
        source: src
      });
      return {
        content: [{
          type: 'text',
          text: `✨ CREATED STORY CARD [${src.toUpperCase()}] #${res.card.id}:\n📋 Title: "${res.card.title}"\n🎯 Points: ${res.card.points || '-'} pts | Priority: ${res.card.priority || '-'}\n💡 Ready to start sprint: call office_sprint_start with card_id: "${res.card.id}"`
        }]
      };
    }
  );

  // 20. LIST PROJECT SESSIONS
  server.tool(
    'office_list_sessions',
    'List all active project directory sessions, their active agents count, sprint status, and current story.',
    {},
    async () => {
      const res = await apiCall('/api/sessions', 'GET');
      const current = resolveSession();
      const lines = [
        `📁 ACTIVE PROJECT SESSIONS (Current Claude project session: "${current}"):`,
        ...res.sessions.map((s: any) => {
          const isCur = s.id === current ? '👉 [ACTIVE]' : '  ';
          return `${isCur} Session: "${s.name}" | Agents: ${s.agentCount} (${s.workingCount}w / ${s.meetingCount}m) | Sprint #${s.sprintNumber} (${s.sprintPhase.toUpperCase()}) | Story: "${s.story || '-'}"`;
        }),
        ``,
        `💡 Sessions are automatically segmented by project directory where Claude Code is working. View live in browser at http://localhost:3333`
      ];
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      };
    }
  );

  // 21. GET CURRENT PROJECT SESSION
  server.tool(
    'office_get_session',
    'Get current project directory session information and status.',
    {},
    async () => {
      const current = resolveSession();
      const res = await apiCall('/api/agents', 'GET', undefined, DEFAULT_PORT, current);
      const sprint = res.sprint || {};
      return {
        content: [{
          type: 'text',
          text: `📁 CURRENT CLAUDE PROJECT SESSION: "${current}"\n👥 Active Agents: ${res.agents?.length || 0}\n🏃 Sprint: #${sprint.sprintNumber || 1} (${sprint.phase?.toUpperCase() || 'IDLE'})\n📋 Current Story: "${sprint.story || '-'}" (${sprint.storyPoints || 0} pts)\n🌐 Web UI: http://localhost:3333?session=${current}`
        }]
      };
    }
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createOfficeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[agent-team MCP] Stdio MCP Server running and ready for Claude.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMcpServer().catch(err => {
    console.error('[agent-team MCP] Fatal error:', err);
    process.exit(1);
  });
}
