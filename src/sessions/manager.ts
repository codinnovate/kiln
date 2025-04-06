import type { AgentConfig } from '../agent/types.js';
import { SessionStore } from './store.js';
import type { Session, SessionMetadata } from './types.js';

export class SessionManager {
  private store: SessionStore;
  private currentSession?: Session;

  constructor(store?: SessionStore) {
    this.store = store ?? new SessionStore();
  }

  async startNewSession(config: AgentConfig): Promise<Session> {
    const id = this.store.generateId();
    const now = new Date().toISOString();

    const session: Session = {
      metadata: {
        id,
        title: 'New Session',
        createdAt: now,
        updatedAt: now,
        model: config.model,
        provider: config.provider,
        projectPath: config.cwd,
        messageCount: 0,
      },
      messages: [],
      state: {
        totalTokens: { input: 0, output: 0 },
        iterations: 0,
      },
    };

    this.currentSession = session;
    await this.store.save(session);
    return session;
  }

  async resumeSession(id: string): Promise<Session> {
    const session = await this.store.load(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    this.currentSession = session;
    return session;
  }

  async saveSession(session: Session): Promise<void> {
    session.metadata.updatedAt = new Date().toISOString();
    session.metadata.messageCount = session.messages.length;
    this.currentSession = session;
    await this.store.save(session);
  }

  async listSessions(limit?: number): Promise<SessionMetadata[]> {
    const all = await this.store.list();
    if (limit && limit > 0) {
      return all.slice(0, limit);
    }
    return all;
  }

  async deleteSession(id: string): Promise<void> {
    if (this.currentSession?.metadata.id === id) {
      this.currentSession = undefined;
    }
    await this.store.delete(id);
  }

  async searchSessions(query: string): Promise<SessionMetadata[]> {
    const all = await this.store.list();
    const lower = query.toLowerCase();
    return all.filter(
      (m) =>
        m.title.toLowerCase().includes(lower) ||
        m.summary?.toLowerCase().includes(lower) ||
        m.model.toLowerCase().includes(lower),
    );
  }

  getCurrentSession(): Session | undefined {
    return this.currentSession;
  }

  generateTitle(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 60) {
      return cleaned;
    }
    return cleaned.slice(0, 57) + '...';
  }
}
