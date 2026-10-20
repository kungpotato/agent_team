import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  green: 1,    // project-planner, scrum-master
  purple: 3,   // product-manager, product-owner, ai-engineer
  yellow: 6,   // qa-tester
  cyan: 0,     // devops-release, devops-engineer
  pink: 4,     // runtime-sre
  magenta: 9,  // ui-ux-designer
  teal: 7      // design-to-code
};

// Default directory points strictly to the user-created agents directory in the project root
const DEFAULT_AGENTS_DIR = path.resolve(__dirname, '../../agents');

export function loadPotatoAgents(dirPath: string = DEFAULT_AGENTS_DIR): Map<string, PotatoAgentDef> {
  const agentMap = new Map<string, PotatoAgentDef>();
  const targetDir = process.env.AGENTS_DIR || process.env.POTATO_AGENTS_DIR || dirPath;

  if (!fs.existsSync(targetDir)) {
    console.warn(`[agents] Directory not found: ${targetDir}`);
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
    const descFoldedMatch = frontmatter.match(/description:\s*>\s*([\s\S]*?)(?=\n[a-z_]+:|$)/i);
    const descSimpleMatch = frontmatter.match(/description:\s*([^\n\r]+)/i);
    const toolsMatch = frontmatter.match(/tools:\s*([^\n\r]+)/);

    const name = nameMatch ? nameMatch[1].trim().toLowerCase() : path.basename(file, '.md').toLowerCase();
    let description = '';
    if (descFoldedMatch && descFoldedMatch[1].trim()) {
      description = descFoldedMatch[1].replace(/\n\s+/g, ' ').trim();
    } else if (descSimpleMatch) {
      description = descSimpleMatch[1].trim();
    }

    const tools = toolsMatch ? toolsMatch[1].split(',').map(t => t.trim()) : [];

    // Assign Startup Bench & Role Metadata exclusively for user-created agents
    let roleTitle = name.toUpperCase();
    let defaultTask = 'Executing task...';
    let defaultColor = 'cyan';
    let targetBench = 0; // Bench 1 default

    if (name === 'product-manager') {
      roleTitle = 'PM';
      defaultColor = 'purple';
      defaultTask = 'Drafting PRD & Acceptance Criteria';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'project-planner') {
      roleTitle = 'PLANNER';
      defaultColor = 'green';
      defaultTask = 'Decomposing task DAG waves';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'product-owner') {
      roleTitle = 'PO';
      defaultColor = 'purple';
      defaultTask = 'Validating story card AC & UAT sign-off';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'scrum-master') {
      roleTitle = 'SCRUM';
      defaultColor = 'green';
      defaultTask = 'Facilitating Agile sprint ceremonies';
      targetBench = 0; // Bench 1 (PRODUCT)
    } else if (name === 'ui-ux-designer') {
      roleTitle = 'UI/UX';
      defaultColor = 'magenta';
      defaultTask = 'Building IA & wireframe screen flow';
      targetBench = 1; // Bench 2 (DESIGNER)
    } else if (name === 'design-to-code') {
      roleTitle = 'UI DEV';
      defaultColor = 'teal';
      defaultTask = 'Decomposing tokens to components';
      targetBench = 1; // Bench 2 (DESIGNER)
    } else if (name === 'system-architect') {
      roleTitle = 'ARCHITECT';
      defaultColor = 'blue';
      defaultTask = 'Designing contracts & OpenAPI specs';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'coder') {
      roleTitle = 'CODER';
      defaultColor = 'orange';
      defaultTask = 'Implementing production code & tests';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'code-reviewer') {
      roleTitle = 'REVIEWER';
      defaultColor = 'red';
      defaultTask = 'Verifying AST & security rules';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'qa-tester') {
      roleTitle = 'QA';
      defaultColor = 'yellow';
      defaultTask = 'Synthesizing fuzz & property tests';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    } else if (name === 'devops-release') {
      roleTitle = 'DEVOPS';
      defaultColor = 'cyan';
      defaultTask = 'Canary rollout & CI/CD deployment';
      targetBench = 3; // Bench 4 (DEVOPS)
    } else if (name === 'devops-engineer') {
      roleTitle = 'OPS';
      defaultColor = 'cyan';
      defaultTask = 'Container runtime & infrastructure';
      targetBench = 3; // Bench 4 (DEVOPS)
    } else if (name === 'runtime-sre') {
      roleTitle = 'SRE';
      defaultColor = 'pink';
      defaultTask = 'Analyzing SLO telemetry & RCA';
      targetBench = 3; // Bench 4 (DEVOPS)
    } else if (name === 'ai-engineer' || name === 'ai') {
      roleTitle = 'AI ENG';
      defaultColor = 'purple';
      defaultTask = 'Designing RAG architectures & prompt chains';
      targetBench = 4; // Bench 5 (AI & DATA)
    } else if (name === 'developer-experience' || name === 'devex' || name === 'dx' || name === 'engineering-manager' || name === 'em') {
      roleTitle = 'DEVEX';
      defaultColor = 'blue';
      defaultTask = 'Eliminating delivery bottlenecks & measuring DORA velocity';
      targetBench = 2; // Bench 3 (TECH: Frontend + Backend + QA)
    }

    const assignedColor = colorMatch ? colorMatch[1].trim().toLowerCase() : defaultColor;
    const colorIndex = POTATO_PALETTE_MAP[assignedColor] ?? 0;

    const agentInfo = {
      name,
      role: name,
      roleTitle,
      color: assignedColor,
      colorIndex,
      description,
      defaultTask,
      targetBench,
      tools
    };
    agentMap.set(name, agentInfo);

    if (name === 'developer-experience') {
      agentMap.set('devex', { ...agentInfo, name: 'devex', role: 'devex' });
      agentMap.set('dx', { ...agentInfo, name: 'dx', role: 'dx' });
      agentMap.set('engineering-manager', { ...agentInfo, name: 'engineering-manager', role: 'engineering-manager' });
      agentMap.set('em', { ...agentInfo, name: 'em', role: 'em' });
    }
  }

  return agentMap;
}

export const potatoAgentRegistry = loadPotatoAgents();

export function getAllPotatoRoles(): string[] {
  return Array.from(potatoAgentRegistry.keys());
}
