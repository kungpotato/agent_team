#!/usr/bin/env node
/**
 * SubagentStop hook: mirrors subagent completion onto the agent-team office dashboard
 * (http://localhost:3333), the other half of sync-agent-team.js (which handles dispatch).
 * Fires when ANY subagent (coder, code-reviewer, etc.) finishes — foreground or background.
 *
 * Known agent_types map to a dedicated, stable desk. A genuinely custom (but real) agent_type
 * falls back to its own name plus a running number (`${agentType}${n}`) from a counter file
 * shared with sync-agent-team.js's dispatch-side counter.
 *
 * agent_type literally "claude" is deliberately IGNORED (no desk created/updated at all) —
 * every real dispatch in this project always passes an explicit subagent_type (coder,
 * code-reviewer, system-architect, ...), so a SubagentStop event reporting the generic "claude"
 * catch-all type is never one of ours; it's an internal/meta event (observed recurring in
 * practice, e.g. "claude1" ghost desks with messages like "checking task status"). Treating it
 * as unknown-but-real and inventing claude1/claude2/... desks for it was the actual bug — this
 * is the root-cause fix, not a wall-clock workaround (see office-stale-cleanup.js for that,
 * which still exists as a safety net for whatever this doesn't catch).
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
  if (agentType === 'claude') process.exit(0); // never one of our real dispatches — see header

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
