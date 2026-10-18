#!/usr/bin/env node
/**
 * PostToolUse hook (matcher "*"): mirrors EVERY real tool call onto the agent-team office
 * dashboard (http://localhost:3333) automatically, so it never silently drifts from what
 * Claude Code is actually doing in this session.
 *
 * - `Agent` tool calls (real subagent dispatch) map to a dedicated desk per subagent_type
 *   (coder -> coder1, code-reviewer -> reviewer1, etc.) — unchanged from before.
 * - Every OTHER tool call (Bash, Read, Edit, Write, Grep, any mcp__*, SendMessage, ...) is
 *   attributed to the main orchestrating session itself, desk name `main1`, with a short
 *   human-readable summary of what that tool call actually did.
 *
 * Never blocks or fails the real tool call: all errors are swallowed and this always exits 0.
 */

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

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 1000);
  });
}

/** Builds a short, human-readable summary of a non-Agent tool call for the `main1` desk. */
function summarize(toolName, input) {
  if (toolName === 'Bash') {
    return `$ ${String(input.command || '').slice(0, 140)}`;
  }
  if (toolName === 'SendMessage') {
    return `→ ${String(input.to || '?')}: ${String(input.summary || input.message || '').slice(0, 120)}`;
  }
  if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
    return `${toolName} ${String(input.file_path || '').slice(0, 130)}`;
  }
  if (['Grep', 'Glob'].includes(toolName)) {
    return `${toolName} "${String(input.pattern || '').slice(0, 100)}"`;
  }
  if (toolName.startsWith('mcp__')) {
    const shortName = toolName.replace(/^mcp__[^_]+(_[^_]+)*__/, '').slice(0, 60);
    return `mcp:${shortName} ${JSON.stringify(input).slice(0, 90)}`;
  }
  return `${toolName} ${JSON.stringify(input).slice(0, 120)}`;
}

async function postWork(name, task, progress) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/agents/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, task, progress }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running or unreachable — never block the real tool call for this.
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

  const toolName = payload.tool_name || 'unknown';
  const input = payload.tool_input || {};

  if (toolName === 'Agent') {
    const subagentType = input.subagent_type || 'claude';
    const officeName = SUBAGENT_TO_OFFICE_NAME[subagentType] || `${subagentType}1`;
    const task = String(input.description || input.prompt || 'working').slice(0, 160);
    await postWork(officeName, task, 15);
  } else {
    await postWork('main1', summarize(toolName, input), 50);
  }

  process.exit(0);
}

main();
