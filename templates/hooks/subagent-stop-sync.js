#!/usr/bin/env node
/**
 * SubagentStop hook: mirrors subagent completion onto the agent-team office dashboard
 * (http://localhost:3333), the other half of sync-agent-team.js (which handles dispatch).
 * Fires when ANY subagent (coder, code-reviewer, etc.) finishes — foreground or background.
 *
 * Known agent_types map to a dedicated, stable desk. An UNKNOWN agent_type falls back to its
 * own name plus a real running number (`${agentType}${n}`) from a counter file shared with
 * sync-agent-team.js's dispatch-side counter — NOT hardcoded to 1 — so repeated completions of
 * an unmapped type get distinct desks instead of overwriting one shared slot. Note: without a
 * shared correlation id between the dispatch-time tool_use_id and this event's agent_id, this
 * can't guarantee landing on the exact same numbered desk the dispatch hook assigned to that
 * specific instance — it's a best-effort approximation, not a precise 1:1 map.
 *
 * Never blocks or fails the real session: all errors are swallowed, always exits 0.
 */

import fs from 'node:fs';

const SUBAGENT_TO_OFFICE_NAME = {
  coder: 'coder1',
  'code-reviewer': 'reviewer1',
  'project-planner': 'project-planner1',
  'system-architect': 'system-architect1',
  'product-manager': 'product-manager1',
  'ui-ux-designer': 'ui-ux-designer1',
  'design-to-code': 'design-to-code1',
  'qa-tester': 'qa-tester1',
  'runtime-sre': 'runtime-sre1',
  'devops-release': 'devops-release1',
};

const COUNTER_FILE = '/tmp/claude-agent-team-type-counters.json';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

/** Latest running number already assigned to this type (by the dispatch-side hook), if any. */
function currentCounter(agentType) {
  try {
    const counters = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    return counters[agentType] || 1;
  } catch {
    return 1;
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
  const officeName = SUBAGENT_TO_OFFICE_NAME[agentType]
    || `${agentType}${currentCounter(agentType)}`;
  const lastMessage = String(payload.last_assistant_message || '').trim();
  const snippet = lastMessage.slice(0, 140) || 'done';
  const task = `✅ done: ${snippet}`;

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
