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

    if (name === 'product-manager') {
      roleTitle = 'PM';
      defaultTask = 'Drafting PRD & Acceptance Criteria';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'project-planner') {
      roleTitle = 'PLANNER';
      defaultTask = 'Decomposing task DAG waves';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'ui-ux-designer') {
      roleTitle = 'UI/UX';
      defaultTask = 'Building IA & wireframe screen flow';
      targetBench = 1; // Bench 2 (DESIGNER)
    } else if (name === 'design-to-code') {
      roleTitle = 'UI DEV';
      defaultTask = 'Decomposing tokens to components';
      targetBench = 1; // Bench 2 (DESIGNER)
    } else if (name === 'system-architect') {
      roleTitle = 'ARCHITECT';
      defaultTask = 'Designing contracts & OpenAPI specs';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'coder') {
      roleTitle = 'CODER';
      defaultTask = 'Implementing production code & tests';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'code-reviewer') {
      roleTitle = 'REVIEWER';
      defaultTask = 'Verifying AST & security rules';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'qa-tester') {
      roleTitle = 'QA';
      defaultTask = 'Synthesizing fuzz & property tests';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'devops-release') {
      roleTitle = 'DEVOPS';
      defaultTask = 'Canary rollout & CI/CD deployment';
      targetBench = 3; // Bench 4 (DEVOPS)
    } else if (name === 'runtime-sre') {
      roleTitle = 'SRE';
      defaultTask = 'Analyzing SLO telemetry & RCA';
      targetBench = 3; // Bench 4 (DEVOPS)
    } else if (name === 'ai-engineer' || name === 'ai') {
      roleTitle = 'AI ENG';
      defaultTask = 'Training & fine-tuning RAG models';
      targetBench = 4; // Bench 5 (AI & DATA)
    } else if (name === 'data-engineer' || name === 'data') {
      roleTitle = 'DATA ENG';
      defaultTask = 'ETL pipeline & vector store indexing';
      targetBench = 4; // Bench 5 (AI & DATA)
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

  // Ensure AI & DATA department agents are always populated
  if (!agentMap.has('ai-engineer')) {
    agentMap.set('ai-engineer', {
      name: 'ai-engineer',
      role: 'ai-engineer',
      roleTitle: 'AI ENG',
      color: 'purple',
      colorIndex: 3,
      description: 'AI / ML Engineer specializing in LLMs, prompts, embeddings, and autonomous agent loops',
      defaultTask: 'Training & fine-tuning RAG models',
      targetBench: 4, // Bench 5 (AI & DATA)
      tools: ['bash', 'editor', 'evaluator']
    });
  }

  if (!agentMap.has('data-engineer')) {
    agentMap.set('data-engineer', {
      name: 'data-engineer',
      role: 'data-engineer',
      roleTitle: 'DATA ENG',
      color: 'teal',
      colorIndex: 7,
      description: 'Data Engineer managing pipeline streaming, parquet, vector databases, and telemetry ETL',
      defaultTask: 'ETL pipeline & vector store indexing',
      targetBench: 4, // Bench 5 (AI & DATA)
      tools: ['bash', 'sql', 'python']
    });
  }

  return agentMap;
}

export const potatoAgentRegistry = loadPotatoAgents();
