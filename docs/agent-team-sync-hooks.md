# Claude Code sync hooks for agent-team

The office dashboard (`http://localhost:3333`) only reflects reality when something calls
`office_set_work` / `office_desk_visit` / etc. Relying on Claude to remember to call these after
every real subagent dispatch does not hold up over a long session — install these two hooks in
the **host project** (not in this repo) so the sync is structural, not a memory aid.

First implemented and verified working in T-CAMPFolio's `.claude/hooks/` during a multi-wave
US-04 epic (dozens of real coder/code-reviewer subagent dispatches across several hours).

## 1. `.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/sync-agent-team.js"],
            "timeout": 5
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/subagent-stop-sync.js"],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## 2. `.claude/hooks/sync-agent-team.js` (fires on every real `Agent` tool dispatch)

```js
#!/usr/bin/env node
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

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  if (payload.tool_name !== 'Agent') process.exit(0);

  const input = payload.tool_input || {};
  const subagentType = input.subagent_type || 'claude';
  const officeName = SUBAGENT_TO_OFFICE_NAME[subagentType] || `${subagentType}1`;
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
    // agent-team server not running/unreachable — never block the real tool call for this.
  }
  process.exit(0);
}

main();
```

## 3. `.claude/hooks/subagent-stop-sync.js` (fires when that subagent actually finishes)

```js
#!/usr/bin/env node
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

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const agentType = payload.agent_type || 'claude';
  const officeName = SUBAGENT_TO_OFFICE_NAME[agentType] || `${agentType}1`;
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
    // agent-team server not running/unreachable — never block the real session for this.
  }
  process.exit(0);
}

main();
```

Make both executable: `chmod +x .claude/hooks/*.js`.

## Known limitations

- A *resumed* agent (via `SendMessage`, e.g. to fix a stale-worktree issue mid-task) does not
  re-fire `PostToolUse` on `Agent` — a manual `office_set_work`/`office_desk_visit` call is still
  the only way to reflect that specific handoff.
- Each `subagent_type` maps to exactly one office desk (e.g. all `coder` dispatches share
  `coder1`), so running many `coder` subagents in parallel will show only the most recently
  dispatched one's task text — the dashboard is a best-effort mirror, not a precise 1:1 map when
  parallelism is high.
- `office_set_work`'s auto-spawn-if-absent behavior means a typo'd or novel `subagent_type` still
  shows up as a new desk (`<type>1`) rather than failing silently — this is usually fine, just be
  aware the roster can grow if many distinct subagent types are used across a session.
