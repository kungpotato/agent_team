import fs from 'fs';
import path from 'path';

export interface PotatoAgentDef {
  name: string;
  role: string;
  roleTitle: string;
  color: string;
  colorIndex: number;
  description: string;
  defaultTask: string;
  targetBench: number; // 0 to 4 (Bench 1 to 5)
  tools: string[];
}

export const POTATO_PALETTE_MAP: Record<string, number> = {
  orange: 2,   // coder
  red: 8,      // code-reviewer
  blue: 5,     // system-architect
  green: 1,    // project-planner
  purple: 3,   // product-manager
  yellow: 6,   // qa-tester
  cyan: 0,     // devops-release
  pink: 4,     // runtime-sre
  magenta: 9,  // ui-ux-designer
  teal: 7      // design-to-code
};

const DEFAULT_POTATO_DIR = '/Users/kittisak/workspace/potato-skill/agents';

export function loadPotatoAgents(dirPath: string = DEFAULT_POTATO_DIR): Map<string, PotatoAgentDef> {
  const agentMap = new Map<string, PotatoAgentDef>();
  const targetDir = process.env.POTATO_AGENTS_DIR || dirPath;

  if (!fs.existsSync(targetDir)) {
    console.warn(`[potato-agents] Directory not found: ${targetDir}`);
    return agentMap;
  }

  const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const fullPath = path.join(targetDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Parse YAML frontmatter
    const match = content.match(/^---\s*([\s\S]*?)\s*---/);
    if (!match) continue;

    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/name:\s*([^\n\r]+)/);
    const colorMatch = frontmatter.match(/color:\s*([^\n\r]+)/);
    const descMatch = frontmatter.match(/description:\s*>([\s\S]*?)(?=\n[a-z]+:|$)/);
    const toolsMatch = frontmatter.match(/tools:\s*([^\n\r]+)/);

    const name = nameMatch ? nameMatch[1].trim().toLowerCase() : path.basename(file, '.md').toLowerCase();
    const color = colorMatch ? colorMatch[1].trim().toLowerCase() : 'cyan';
    const description = descMatch ? descMatch[1].replace(/\n\s+/g, ' ').trim() : '';
    const tools = toolsMatch ? toolsMatch[1].split(',').map(t => t.trim()) : [];

    // Assign Startup Bench & Role Metadata
    let roleTitle = name.toUpperCase();
    let defaultTask = 'Executing task...';
    let targetBench = 0; // Bench 1 default

    if (name === 'coder') {
      roleTitle = 'CODER';
      defaultTask = 'Implementing production code & tests';
      targetBench = 2; // Bench 3 (Backend & API)
    } else if (name === 'code-reviewer') {
      roleTitle = 'REVIEWER';
      defaultTask = 'Verifying AST & security rules';
      targetBench = 2; // Bench 3 (Backend & API)
    } else if (name === 'system-architect') {
      roleTitle = 'ARCHITECT';
      defaultTask = 'Designing contracts & OpenAPI specs';
      targetBench = 0; // Bench 1 (Core Tech)
    } else if (name === 'project-planner') {
      roleTitle = 'PLANNER';
      defaultTask = 'Decomposing task DAG waves';
      targetBench = 0; // Bench 1 (Core Tech)
    } else if (name === 'product-manager') {
      roleTitle = 'PM';
      defaultTask = 'Drafting PRD & Acceptance Criteria';
      targetBench = 0; // Bench 1 (Core Tech)
    } else if (name === 'ui-ux-designer') {
      roleTitle = 'UI/UX';
      defaultTask = 'Building IA & wireframe screen flow';
      targetBench = 1; // Bench 2 (Frontend & UI)
    } else if (name === 'design-to-code') {
      roleTitle = 'UI DEV';
      defaultTask = 'Decomposing tokens to components';
      targetBench = 1; // Bench 2 (Frontend & UI)
    } else if (name === 'qa-tester') {
      roleTitle = 'QA';
      defaultTask = 'Synthesizing fuzz & property tests';
      targetBench = 3; // Bench 4 (AI & QA)
    } else if (name === 'runtime-sre') {
      roleTitle = 'SRE';
      defaultTask = 'Analyzing SLO telemetry & RCA';
      targetBench = 3; // Bench 4 (AI & QA)
    } else if (name === 'devops-release') {
      roleTitle = 'DEVOPS';
      defaultTask = 'Canary rollout & CI/CD deployment';
      targetBench = 4; // Bench 5 (DevOps & Infra)
    }

    const colorIndex = POTATO_PALETTE_MAP[color] ?? 0;

    agentMap.set(name, {
      name,
      role: name,
      roleTitle,
      color,
      colorIndex,
      description,
      defaultTask,
      targetBench,
      tools
    });
  }

  return agentMap;
}

export const potatoAgentRegistry = loadPotatoAgents();
