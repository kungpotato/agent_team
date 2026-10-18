---
name: backlog
description: Query, create, and inspect story cards from Taskwarrior (default kanban backlog) and Jira. Use when looking for work to do, checking the backlog, or adding new user stories.
---

# Story Cards Backlog Management (Taskwarrior Default & Jira)

The project manages story cards across two providers, with **Taskwarrior (Kanban)** serving as the default provider.

## Backlog Operations

### 1. View Backlog Cards
- Default (Taskwarrior): Call `office_get_cards({ source: "taskwarrior" })` or run `agent-team cards`
- Jira: Call `office_get_cards({ source: "jira" })` or run `agent-team cards jira`

### 2. Add Story Card into Taskwarrior
- Call `office_add_card({ title: "...", points: 5, tags: ["auth", "security"], priority: "M" })`
- Or via CLI: `agent-team card-add "<title>" -p <pts> -t <tags>`

### 3. Start a Sprint with a Card
- **Auto-select top pending card**: Call `office_sprint_start({})` or run `agent-team sprint start`. It will automatically pick the top pending card from Taskwarrior.
- **Specific Card ID**: Call `office_sprint_start({ card_id: "1", source: "taskwarrior" })` or run `agent-team sprint start -c 1`.
- **Jira Card**: Call `office_sprint_start({ card_id: "JIRA-101", source: "jira" })` or run `agent-team sprint start -c JIRA-101 -s jira`.

### 4. Lifecycle Synchronization
- Starting a sprint with a card marks it in-progress (`task <id> start`).
- Completing a sprint via `office_sprint_complete` marks the card completed (`task <id> done` or transitions Jira issue to Done).
