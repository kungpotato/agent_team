import { execFile } from 'child_process';
import { promisify } from 'util';
import { CardSourceProvider, StoryCard } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Taskwarrior Provider (Default Kanban Card Source)
 */
export class TaskwarriorProvider {
  private fallbackCards: StoryCard[] = [
    {
      id: '1',
      title: 'AUTH-101: Implement OAuth2 & JWT Security',
      points: 8,
      status: 'todo',
      source: 'taskwarrior',
      project: 'AUTH',
      priority: 'H',
      tags: ['security', 'auth', '8pts']
    },
    {
      id: '2',
      title: 'PAYMENT-201: Stripe Recurring Subscription Billing',
      points: 5,
      status: 'todo',
      source: 'taskwarrior',
      project: 'PAYMENT',
      priority: 'M',
      tags: ['billing', 'stripe', '5pts']
    },
    {
      id: '3',
      title: 'NOTIF-301: WebSocket Realtime Event Bus',
      points: 8,
      status: 'todo',
      source: 'taskwarrior',
      project: 'CORE',
      priority: 'H',
      tags: ['websocket', 'events', '8pts']
    }
  ];

  /**
   * Check if task binary is available on PATH
   */
  public async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('task', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export all tasks from Taskwarrior
   */
  public async getCards(): Promise<StoryCard[]> {
    const available = await this.isAvailable();
    if (!available) {
      return [...this.fallbackCards];
    }

    try {
      const { stdout } = await execFileAsync('task', ['export']);
      const rawTasks = JSON.parse(stdout || '[]');
      if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        return [...this.fallbackCards];
      }

      return rawTasks
        .filter((t: any) => t.status !== 'deleted')
        .map((t: any) => {
          let points = 5;
          const desc = t.description || 'Untitled Task';
          // Extract points from "+5pts" or "+8" or tags
          const ptsMatch = desc.match(/\+?(\d+)\s*pts?/i) || desc.match(/\+(\d+)\b/);
          if (ptsMatch) {
            points = parseInt(ptsMatch[1], 10);
          } else if (t.priority === 'H') {
            points = 8;
          } else if (t.priority === 'M') {
            points = 5;
          } else if (t.priority === 'L') {
            points = 3;
          }

          // Clean title
          const cleanTitle = desc.replace(/\s*\+\d+\s*pts?/i, '').replace(/\s*\+\S+/g, '').trim();

          let status: 'todo' | 'in_progress' | 'done' = 'todo';
          if (t.status === 'completed') {
            status = 'done';
          } else if (t.start || (t.tags && t.tags.includes('active'))) {
            status = 'in_progress';
          }

          return {
            id: String(t.id || t.uuid),
            title: cleanTitle || desc,
            description: desc,
            points,
            status,
            source: 'taskwarrior' as CardSourceProvider,
            project: t.project || 'SPRINT',
            priority: t.priority || 'M',
            tags: t.tags || []
          };
        });
    } catch {
      return [...this.fallbackCards];
    }
  }

  public async getCard(id: string): Promise<StoryCard | undefined> {
    const cards = await this.getCards();
    return cards.find(c => c.id === id || c.id.toLowerCase() === id.toLowerCase() || c.title.toLowerCase().includes(id.toLowerCase()));
  }

  public async startCard(id: string): Promise<void> {
    try {
      await execFileAsync('task', [id, 'start']);
    } catch {
      const fb = this.fallbackCards.find(c => c.id === id);
      if (fb) fb.status = 'in_progress';
    }
  }

  public async completeCard(id: string): Promise<void> {
    try {
      await execFileAsync('task', [id, 'done']);
    } catch {
      const fb = this.fallbackCards.find(c => c.id === id);
      if (fb) fb.status = 'done';
    }
  }

  public async addCard(title: string, options?: { points?: number; project?: string; tags?: string[] }): Promise<StoryCard> {
    const pts = options?.points || 5;
    const project = options?.project || 'SPRINT';
    const tags = options?.tags || [];
    const priority = pts >= 8 ? 'H' : pts >= 5 ? 'M' : 'L';

    try {
      const args = ['add', title, `project:${project}`, `priority:${priority}`, `+${pts}pts`];
      for (const t of tags) args.push(`+${t}`);
      await execFileAsync('task', args);

      const cards = await this.getCards();
      const created = cards.find(c => c.title.includes(title));
      if (created) return created;
    } catch {
      // Fallback
    }

    const newCard: StoryCard = {
      id: String(this.fallbackCards.length + 1),
      title,
      points: pts,
      status: 'todo',
      source: 'taskwarrior',
      project,
      priority,
      tags: [...tags, `${pts}pts`]
    };
    this.fallbackCards.push(newCard);
    return newCard;
  }
}

/**
 * Jira Provider (Jira Cloud / Server or Jira Mock Backlog)
 */
export class JiraProvider {
  private mockJiraCards: StoryCard[] = [
    {
      id: 'JIRA-101',
      title: 'JIRA-101: Distributed Session Invalidation & Redis Cache',
      description: 'Implement distributed token revocation across clusters.',
      points: 8,
      status: 'todo',
      source: 'jira',
      project: 'BACKEND',
      priority: 'High',
      tags: ['auth', 'redis', 'jira']
    },
    {
      id: 'JIRA-102',
      title: 'JIRA-102: Customer Invoice PDF Export & Email Delivery',
      description: 'Automate PDF invoice rendering and SMTP dispatching.',
      points: 5,
      status: 'todo',
      source: 'jira',
      project: 'BILLING',
      priority: 'Medium',
      tags: ['invoice', 'pdf', 'jira']
    },
    {
      id: 'JIRA-103',
      title: 'JIRA-103: Multi-tenant Tenant Isolation & Schema Migration',
      description: 'Verify PostgreSQL schema separation per organizational tenant.',
      points: 13,
      status: 'todo',
      source: 'jira',
      project: 'INFRA',
      priority: 'Highest',
      tags: ['postgres', 'multi-tenant', 'jira']
    }
  ];

  public async getCards(): Promise<StoryCard[]> {
    const host = process.env.JIRA_HOST;
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN || process.env.JIRA_PAT;

    if (host && (token || email)) {
      try {
        const authHeader = email ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` : `Bearer ${token}`;
        const jql = encodeURIComponent('resolution = Unresolved ORDER BY priority DESC');
        const res = await fetch(`${host.replace(/\/$/, '')}/rest/api/2/search?jql=${jql}&maxResults=20`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(3500)
        });

        if (res.ok) {
          const data: any = await res.json();
          if (Array.isArray(data.issues)) {
            return data.issues.map((i: any) => ({
              id: i.key,
              title: `${i.key}: ${i.fields.summary}`,
              description: i.fields.description || i.fields.summary,
              points: i.fields.customfield_10016 || i.fields.customfield_10026 || 5,
              status: i.fields.status?.statusCategory?.key === 'done' ? 'done' : (i.fields.status?.statusCategory?.key === 'indeterminate' ? 'in_progress' : 'todo'),
              source: 'jira' as CardSourceProvider,
              project: i.fields.project?.key || 'JIRA',
              priority: i.fields.priority?.name || 'Medium',
              tags: i.fields.labels || []
            }));
          }
        }
      } catch {
        // Fall back to mock Jira cards if live fetch fails
      }
    }

    return [...this.mockJiraCards];
  }

  public async getCard(id: string): Promise<StoryCard | undefined> {
    const cards = await this.getCards();
    return cards.find(c => c.id.toLowerCase() === id.toLowerCase() || c.title.toLowerCase().includes(id.toLowerCase()));
  }

  public async startCard(id: string): Promise<void> {
    const c = this.mockJiraCards.find(card => card.id.toLowerCase() === id.toLowerCase());
    if (c) c.status = 'in_progress';
  }

  public async completeCard(id: string): Promise<void> {
    const c = this.mockJiraCards.find(card => card.id.toLowerCase() === id.toLowerCase());
    if (c) c.status = 'done';
  }
}

/**
 * Unified Card Manager (Defaults to Taskwarrior Kanban)
 */
export class CardManager {
  private tw = new TaskwarriorProvider();
  private jira = new JiraProvider();
  public defaultSource: CardSourceProvider = 'taskwarrior';

  public async getCards(source: CardSourceProvider = this.defaultSource): Promise<StoryCard[]> {
    if (source === 'jira') {
      return this.jira.getCards();
    }
    return this.tw.getCards();
  }

  public async getCard(id: string, source?: CardSourceProvider): Promise<StoryCard | undefined> {
    if (source === 'jira' || (id && id.toUpperCase().startsWith('JIRA-'))) {
      return this.jira.getCard(id);
    }
    const twCard = await this.tw.getCard(id);
    if (twCard) return twCard;
    return this.jira.getCard(id);
  }

  public async startCard(card: StoryCard): Promise<void> {
    if (card.source === 'jira') {
      await this.jira.startCard(card.id);
    } else {
      await this.tw.startCard(card.id);
    }
  }

  public async completeCard(card: StoryCard): Promise<void> {
    if (card.source === 'jira') {
      await this.jira.completeCard(card.id);
    } else {
      await this.tw.completeCard(card.id);
    }
  }

  public async addCard(title: string, options?: { points?: number; project?: string; tags?: string[]; source?: CardSourceProvider }): Promise<StoryCard> {
    const src = options?.source || this.defaultSource;
    if (src === 'jira') {
      const newCard: StoryCard = {
        id: `JIRA-${Math.floor(100 + Math.random() * 900)}`,
        title,
        points: options?.points || 5,
        status: 'todo',
        source: 'jira',
        project: options?.project || 'PROJ',
        priority: 'Medium',
        tags: options?.tags || ['jira']
      };
      return newCard;
    }
    return this.tw.addCard(title, options);
  }
}

export const cardManager = new CardManager();
