#!/usr/bin/env node
/**
 * SubagentStop hook: whenever a subagent's final message contains a NEEDS_PM / NEEDS_ARCH /
 * NEEDS_PLANNER / NEEDS_DESIGN / NEEDS_INPUT block (the standing escalation protocol every
 * agent definition in .claude/agents/*.md ends with), auto-posts it to the agent-team office
 * dashboard's Slack-like thread system — so every open question is logged the moment it's
 * raised, not only when the orchestrating session remembers to relay it by hand.
 *
 * This does NOT dispatch the responding role itself — hooks can't call the Agent tool, only
 * the orchestrating Claude session can. It only guarantees the question is never silently lost:
 * posted as a real, inspectable thread entry the instant the subagent stops, before any human
 * or orchestrator action. The orchestrating session still owns actually resuming/dispatching
 * the right role to answer it (see CLAUDE.md's "escalation block → thread → dispatch" rule).
 *
 * Never blocks or fails the real session: all errors are swallowed, always exits 0.
 */

const BLOCK_TO_ROLE = {
  NEEDS_PM: 'product-manager1',
  NEEDS_ARCH: 'system-architect1',
  NEEDS_PLANNER: 'project-planner1',
  NEEDS_DESIGN: 'ui-ux-designer1',
  NEEDS_INPUT: null, // human-only — no agent mention, flagged for the orchestrator/user instead
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

/** Finds the first NEEDS_* block: from its header line to the next blank line, or end of text. */
function extractBlock(text) {
  const headerRe = /^(NEEDS_PM|NEEDS_ARCH|NEEDS_PLANNER|NEEDS_DESIGN|NEEDS_INPUT)\s*$/m;
  const match = headerRe.exec(text);
  if (!match) return null;
  const start = match.index;
  const rest = text.slice(start);
  const blankLineIdx = rest.search(/\n\s*\n/);
  const body = blankLineIdx === -1 ? rest : rest.slice(0, blankLineIdx);
  return { kind: match[1], body: body.trim() };
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
  if (agentType === 'claude') process.exit(0); // never one of our real dispatches

  const lastMessage = String(payload.last_assistant_message || '');
  const block = extractBlock(lastMessage);
  if (!block) process.exit(0);

  const mentionRole = BLOCK_TO_ROLE[block.kind];
  const title = `${block.kind} raised by ${agentType}`.slice(0, 80);
  const point = block.body.slice(0, 1800); // Smart-Brevity point field, keep it bounded

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch('http://localhost:3333/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        category: 'consult',
        author: `${agentType}1`,
        topic: block.kind,
        intent: 'Auto-logged escalation block — needs a real answer before this task can proceed.',
        point,
        nextSteps: mentionRole
          ? `@${mentionRole} please review and reply in this thread.`
          : 'Human-only decision — surface to the user before proceeding.',
        mentions: mentionRole ? [`@${mentionRole}`] : [],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // agent-team server not running/unreachable — never block the real session for this.
  }

  process.exit(0);
}

main();
