#!/usr/bin/env node
/**
 * PostToolUse hook (matcher "Agent"): mirrors every real `Agent` tool dispatch onto the
 * agent-team office dashboard (http://localhost:3333) automatically, so it never silently
 * drifts from what Claude Code is actually doing in this session.
 *
 * Known subagent_types map to a dedicated, stable desk (coder -> coder1, code-reviewer ->
 * reviewer1, etc.). An UNKNOWN subagent_type falls back to its own name plus a real running
 * number (`${subagentType}${n}`), n assigned fresh per dispatch from a shared counter file —
 * NOT hardcoded to 1 — so that several concurrent/sequential dispatches of the same unmapped
 * type get distinct desks instead of overwriting each other's status on one shared slot.
 *
 * Never blocks or fails the real tool call: all errors are swallowed and this always exits 0.
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

/** Next running number for an unmapped subagent_type, persisted across hook invocations. */
function nextCounter(subagentType) {
  let counters = {};
  try {
    counters = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  } catch {
    // first run / corrupt file — start fresh
  }
  const n = (counters[subagentType] || 0) + 1;
  counters[subagentType] = n;
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters));
  } catch {
    // best-effort only
  }
  return n;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (payload.tool_name !== 'Agent') process.exit(0);

  const input = payload.tool_input || {};
  const subagentType = input.subagent_type || 'claude';
  const officeName = SUBAGENT_TO_OFFICE_NAME[subagentType]
    || `${subagentType}${nextCounter(subagentType)}`;
  const task = String(input.description || input.prompt || 'working').slice(0, 160);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: officeName, task, progress: 15 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running or unreachable — never block the real tool call for this.
  }

  process.exit(0);
}

main();
