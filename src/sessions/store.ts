import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getConfigDir } from '../config/loader.js';
import type { Session, SessionMetadata } from './types.js';

const SESSIONS_DIR = 'sessions';

export class SessionStore {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(getConfigDir(), SESSIONS_DIR);
  }

  async save(session: Session): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    const filePath = this.getFilePath(session.metadata.id);
    const data = JSON.stringify(session, null, 2);
    await writeFile(filePath, data, 'utf-8');
  }

  async load(id: string): Promise<Session | null> {
    const filePath = this.getFilePath(id);
    try {
      const data = await readFile(filePath, 'utf-8');
      const session = JSON.parse(data) as Session;
      if (!session.metadata?.id || !Array.isArray(session.messages)) {
        console.warn(`Corrupt session file: ${filePath}`);
        return null;
      }
      return session;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      console.warn(`Failed to load session ${id}: ${err}`);
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return;
      }
      throw err;
    }
  }

  async list(): Promise<SessionMetadata[]> {
    try {
      const entries = await readdir(this.basePath);
      const jsonFiles = entries.filter((f) => f.endsWith('.json'));

      const sessions: SessionMetadata[] = [];
      for (const file of jsonFiles) {
        const filePath = join(this.basePath, file);
        try {
          const data = await readFile(filePath, 'utf-8');
          const session = JSON.parse(data) as Session;
          if (session.metadata?.id) {
            sessions.push(session.metadata);
          } else {
            console.warn(`Corrupt session file skipped: ${file}`);
          }
        } catch {
          console.warn(`Failed to read session file: ${file}`);
        }
      }

      sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return sessions;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw err;
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await readFile(filePath, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  generateId(): string {
    return uuidv4();
  }

  getFilePath(id: string): string {
    return join(this.basePath, `${id}.json`);
  }
}
