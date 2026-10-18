# CLAUDE.md - Mandatory Agile Sprint Ceremony Governance Policy

> [!IMPORTANT]
> **STRICT ENFORCEMENT NOTICE FOR CLAUDE & ALL AI AGENTS:**
> When using this project, coordinating agents, or invoking `agent-team` tools, **every agent MUST strictly follow the 8-phase Agile Sprint Ceremony protocol**.
> Agents are strictly forbidden from skipping ceremonies, jumping straight into coding without planning, or deploying to production without formal UAT sign-off.

---

## 🏛️ The 8 Mandatory Sprint Ceremonies

Every task, feature, or user story lifecycle MUST advance through these 8 phases in sequence:

| Phase # | Ceremony Name | Location | Required Attendees | Primary Objective & Deliverable |
|---|---|---|---|---|
| **1** | `validation` | 🚪 Room 2: Delta Room (Δ) | `product-manager`, `system-architect`, `coder` | PO presents story card; Architect & Dev validate feasibility and refine Acceptance Criteria (AC). |
| **2** | `grooming` | 🚪 Room 1: Sigma Room (Σ) | `coder`, `qa-tester`, `code-reviewer`, `product-manager`, `system-architect` | Team analyzes edge cases, test vectors, and estimates Story Points (Fibonacci: 1, 2, 3, 5, 8, 13). |
| **3** | `planning` | 🏛️ Room 5: Infinity Boardroom (∞) | All 8 Leads & Specialists | Decompose task DAG waves, define dependencies, and commit to sprint backlog distribution. |
| **4** | `working` | 💻 Open Space Desks | All Agents across 5 Departments | Agents seated at their designated department workbenches (Product, Designer, Tech, DevOps, AI & DATA) implementing features, UI, tests, infra, and models with live progress HUDs. |
| **5** | `demo` | 🚪 Room 3: Lambda Room (λ) | `coder`, `ui-ux-designer`, `qa-tester`, `product-manager` | Dev team demonstrates working software live to PO and stakeholders for initial validation. |
| **6** | `uat` | 🚪 Room 2: Delta Room (Δ) | `product-manager`, `qa-tester`, `coder`, `system-architect` | **Formal UAT Verification & Sign-Off**. PO and QA execute acceptance tests. Formal sign-off is MANDATORY before release. |
| **7** | `release` | 🚪 Room 4: Omega Room (Ω) | `devops-release`, `runtime-sre`, `coder`, `system-architect` | Production deployment, CI/CD pipeline execution, and automated canary SLO telemetry verification. |
| **8** | `retro` | 🏛️ Room 5: Infinity Boardroom (∞) | All 8 Leads & Specialists | Sprint Retrospective: Analyze issues encountered, extract lessons learned, and log action items for continuous improvement. |

---

## 🛑 Strict Governance Rules for Claude

### Rule 1: No Unapproved Coding (Phases 1-3 Mandatory)
- **NEVER** set agents to write production code or mark tasks as in-progress before Phase 1 (`validation`), Phase 2 (`grooming`), and Phase 3 (`planning`) have occurred.
- If a user requests a new feature or bugfix, Claude must first initialize the sprint ticket and conduct validation and grooming.

### Rule 2: Desk-Bound Working (Phase 4 Only)
- During Phase 4 (`working`), all agents must return to open-space workbenches.
- Claude must update agent progress (`office_update_progress` or `agent-team progress`) from 0% to 100% as tasks advance.

### Rule 3: Zero-Tolerance Production Release without UAT (Phase 6 Mandatory)
- **NEVER** initiate Phase 7 (`release`) without formal sign-off in Phase 6 (`uat`).
- Product Owner (`product-manager`) and QA Tester (`qa-tester`) MUST sign off on acceptance criteria before any code reaches production.

### Rule 4: Retrospective Is Non-Negotiable (Phase 8 Mandatory)
- After every production release, Claude must assemble the team in the Infinity Boardroom (∞ / Room 5) for Phase 8 (`retro`) to document lessons learned before concluding the sprint cycle.

### Rule 5: Continuous Sprint Lifecycle & Story Card Backlog (Taskwarrior Default & Jira)
- **Default Card Backlog Provider**: Sprints and ceremonies work with story cards sourced from **Taskwarrior (Kanban)** by default, or optionally from **Jira**.
- When calling `office_sprint_start` without a story or card ID, it automatically selects the top pending card from Taskwarrior.
- Starting a sprint with a card marks it in-progress (`task <id> start`).
- Completing a sprint via `office_sprint_complete` automatically marks the card as completed (`task <id> done` or transitions Jira issue to Done).
- Once the sprint retrospective is complete, Claude MUST call `office_sprint_complete` (or `agent-team sprint complete`) to formally close and archive the sprint.
- To take on new work, Claude immediately launches the next sprint with `office_sprint_start` (auto-incrementing to Sprint #N+1). This allows continuous agile delivery across infinite milestones.

### Rule 6: Multi-Session Segmentation by Project Directory
- Every running project directory where Claude Code operates automatically receives its own isolated session (derived from `path.basename(process.cwd())` or `CLAUDE_PROJECT_DIR`).
- Each directory session maintains its own independent agent roster, active sprint lifecycle, card backlog, and conference rooms.
- Sessions can be monitored and listed via `office_list_sessions` or CLI `agent-team sessions`.
- The Web Canvas UI (`http://localhost:3333`) provides an interactive directory session dropdown in the retro header to switch between projects seamlessly in real-time.

### Rule 7: The Dashboard Is Only As Honest As Its Sync Hooks — Install Them At Setup Time
- `office_set_work`, `office_desk_visit`, and the other MCP tools only move the dashboard when
  something explicitly calls them. Relying on Claude to remember to call them after every real
  `Agent`-tool dispatch does not hold up over a long multi-wave session — this has been observed
  to silently drift in practice.
- **Whenever this MCP server is installed into a new host project, Claude MUST also set up the
  two Claude Code hooks described in [`docs/agent-team-sync-hooks.md`](docs/agent-team-sync-hooks.md)
  in that host project's own `.claude/settings.json`**: a `PostToolUse` hook on the `Agent` tool
  (syncs on dispatch) and a `SubagentStop` hook (syncs on completion). Do this as part of initial
  setup, not as an afterthought — it is the only way the dashboard stays a structurally-guaranteed
  reflection of real work rather than something that depends on Claude's own memory/discipline.
- This is a per-host-project setup step (the hook scripts live in the host project's
  `.claude/hooks/`, not in this repo) — treat skipping it as an incomplete installation.

---

## 🛠️ Tool Calling Mapping for Claude

When Claude operates via MCP or terminal CLI:

| Sprint Step | MCP Tool Call | CLI Command Shortcut |
|---|---|---|
| List Directory Sessions | `office_list_sessions({})` | `agent-team session list` |
| Current Session Info | `office_get_session({})` | `agent-team session current` |
| Create Session | `office_create_session({ name: "..." })` | `agent-team session create <name>` |
| Switch Session Context | `office_switch_session({ session: "..." })` | `agent-team session switch <name>` |
| Reset Session | `office_reset_session({ session: "..." })` | `agent-team session reset <name>` |
| Delete Session | `office_delete_session({ session: "..." })` | `agent-team session delete <name>` |
| View Card Backlog | `office_get_cards({ source: "taskwarrior" })` | `agent-team cards` or `agent-team backlog` |
| Add Story Card | `office_add_card({ title, points, tags, priority })` | `agent-team card-add <title> -p <pts>` |
| Initialize Sprint | `office_sprint_start({ card_id, source: "taskwarrior", sprint_number, story, points })` | `agent-team sprint start [-c id] [-s tw]` |
| 1. Validation | `office_sprint_ceremony({ phase: "validation" })` | `agent-team validate` |
| 2. Grooming | `office_sprint_ceremony({ phase: "grooming", points: N })`| `agent-team groom [pts]` |
| 3. Planning | `office_sprint_ceremony({ phase: "planning" })` | `agent-team plan` |
| 4. Sprint Work | `office_sprint_ceremony({ phase: "working" })` | `agent-team sprint ceremony working` |
| Update Progress | `office_update_progress({ agent_name, progress, task })` | `agent-team progress <name> <%> [task]` |
| 5. Demo | `office_sprint_ceremony({ phase: "demo" })` | `agent-team demo` |
| 6. UAT Sign-Off | `office_sprint_ceremony({ phase: "uat" })` | `agent-team uat` |
| 7. Release Prod | `office_sprint_ceremony({ phase: "release" })` | `agent-team release` |
| 8. Retrospective | `office_sprint_ceremony({ phase: "retro" })` | `agent-team retro` |
| Complete Sprint | `office_sprint_complete({ summary })` | `agent-team complete-sprint` or `agent-team sprint complete` |
| Sequential Next | `office_sprint_next({})` | `agent-team sprint next` |
| Status Check | `office_sprint_status({})` | `agent-team sprint status` |

---

## 💡 Example Continuous Workflow for Claude

When the user asks Claude: *"Implement user password reset via email"*:
1. Claude runs `office_sprint_start` with story `"AUTH-201: Password Reset by Email"`.
2. Claude calls `office_sprint_ceremony({ phase: "validation" })` (Room 2: Delta Room Δ).
3. Claude calls `office_sprint_ceremony({ phase: "grooming", points: 5 })` (Room 1: Sigma Room Σ).
4. Claude calls `office_sprint_ceremony({ phase: "planning" })` (Room 5: Infinity Boardroom ∞).
5. Claude calls `office_sprint_ceremony({ phase: "working" })` and updates tasks/progress.
6. Claude calls `office_sprint_ceremony({ phase: "demo" })` (Room 3: Lambda Room λ).
7. Claude calls `office_sprint_ceremony({ phase: "uat" })` (Room 2: Delta Room Δ) to sign off criteria.
8. Claude calls `office_sprint_ceremony({ phase: "release" })` (Room 4: Omega Room Ω) for canary deployment.
9. Claude calls `office_sprint_ceremony({ phase: "retro" })` (Room 5: Infinity Boardroom ∞) for lessons learned.
10. Claude calls `office_sprint_complete({ summary: "Password reset deployed with 100% tests passing" })` to archive Sprint #1.
11. When new work arrives, Claude calls `office_sprint_start` to kick off Sprint #2!
