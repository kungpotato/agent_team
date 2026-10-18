#!/usr/bin/env node
/**
 * SubagentStop hook: mirrors subagent completion onto the agent-team office dashboard
 * (http://localhost:3333), the other half of sync-agent-team.js (which handles dispatch).
 * Fires when ANY subagent (coder, code-reviewer, etc.) finishes — foreground or background.
 *
 * agent_type literally "claude" is deliberately IGNORED (no desk touched) — every real
 * dispatch in this project passes an explicit subagent_type, so a SubagentStop event reporting
 * the generic "claude" catch-all type is never one of ours (confirmed recurring in practice as
 * ghost desks before this fix).
 *
 * sync-agent-team.js assigns the LOWEST FREE number for a type's base desk name on every
 * dispatch (so N concurrent coders show as coder1..coderN, not one shared/overwritten slot).
 * This hook has no reliable way to know exactly WHICH numbered instance just finished (no
 * shared id between the dispatch-time tool_use_id and this event's agent_id) — as a best-effort
 * heuristic it marks the OLDEST currently-busy desk of that base name as done (first dispatched
 * assumed to finish first), freeing that slot for reuse. This is an approximation, not a
 * precise 1:1 map; it's still strictly better than always targeting a single fixed name, which
 * would silently clobber one of several concurrent desks' status.
 *
 * Never blocks or fails the real session: all errors are swallowed, always exits 0.
 *
 * Also clears the finished desk from real-desks-state.js's shared set (see sync-agent-team.js)
 * so ceremony-cleanup.js no longer treats it as a genuinely in-flight dispatch once it's done.
 */

import { removeRealDesk } from './real-desks-state.js';

const BASE_NAME = {
  coder: 'coder',
  'code-reviewer': 'reviewer',
  'project-planner': 'project-planner',
  'system-architect': 'system-architect',
  'product-manager': 'product-manager',
  'ui-ux-designer': 'ui-ux-designer',
  'design-to-code': 'design-to-code',
  'qa-tester': 'qa-tester',
  'runtime-sre': 'runtime-sre',
  'devops-release': 'devops-release',
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

/** Name of the oldest-updated currently-busy desk for this base name, or `${baseName}1` if none. */
async function oldestBusyDesk(baseName) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('http://localhost:3333/api/agents', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return `${baseName}1`;
    const data = await res.json();
    const agents = Array.isArray(data.agents) ? data.agents : [];
    const re = new RegExp(`^${baseName}(\\d+)$`);
    let oldest = null;
    for (const a of agents) {
      if (re.test(a.name) && a.status === 'working' && a.progress !== 100) {
        if (!oldest || (a.updatedAt || 0) < (oldest.updatedAt || 0)) oldest = a;
      }
    }
    return oldest ? oldest.name : `${baseName}1`;
  } catch {
    return `${baseName}1`;
  }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const agentType = payload.agent_type || 'claude';
  if (agentType === 'claude') process.exit(0); // never one of our real dispatches — see header

  const baseName = BASE_NAME[agentType] || agentType;
  const officeName = await oldestBusyDesk(baseName);
  const lastMessage = String(payload.last_assistant_message || '').trim();
  const snippet = lastMessage.slice(0, 140) || 'done';
  const task = `✅ done: ${snippet}`;

  try {
    removeRealDesk(officeName);
  } catch {
    // best-effort — never block the real session over this.
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: officeName, task, progress: 100 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running or unreachable — never block the real session for this.
  }

  process.exit(0);
}

main();
