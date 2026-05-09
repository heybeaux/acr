/**
 * File-based persistent StateStore implementation.
 *
 * Stores capability state as JSON files in a directory structure:
 *   {baseDir}/{sessionId}/{capabilityName}.json
 *
 * Suitable for single-machine deployments. For distributed systems,
 * implement StateStore with a database backend.
 */

import { readFile, writeFile, mkdir, unlink, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { StateStore, SerializedState } from '@agentcapabilityruntime/schema';

export interface FileStateStoreConfig {
  /** Base directory for state files */
  baseDir: string;

  /** Pretty-print JSON (default: false) */
  prettyPrint?: boolean;
}

export class FileStateStore implements StateStore {
  private readonly baseDir: string;
  private readonly prettyPrint: boolean;

  constructor(config: FileStateStoreConfig) {
    this.baseDir = config.baseDir;
    this.prettyPrint = config.prettyPrint ?? false;
  }

  private filePath(sessionId: string, capabilityName: string): string {
    // Sanitize session ID for filesystem safety
    const safeSession = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = capabilityName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.baseDir, safeSession, `${safeName}.json`);
  }

  async save(sessionId: string, state: SerializedState): Promise<void> {
    const path = this.filePath(sessionId, state.capabilityName);
    await mkdir(dirname(path), { recursive: true });

    const json = this.prettyPrint
      ? JSON.stringify(state, null, 2)
      : JSON.stringify(state);

    await writeFile(path, json, 'utf-8');
  }

  async load(
    sessionId: string,
    capabilityName: string,
    capabilityVersion: string,
  ): Promise<SerializedState | null> {
    const path = this.filePath(sessionId, capabilityName);

    try {
      const content = await readFile(path, 'utf-8');
      const state: SerializedState = JSON.parse(content);

      // Version mismatch → discard
      if (state.capabilityVersion !== capabilityVersion) {
        await this.delete(sessionId, capabilityName);
        return null;
      }

      return state;
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(sessionId: string, capabilityName: string): Promise<void> {
    const path = this.filePath(sessionId, capabilityName);
    try {
      await unlink(path);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const safeSession = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sessionDir = join(this.baseDir, safeSession);

    try {
      await rm(sessionDir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * List all sessions with stored state.
   */
  async listSessions(): Promise<string[]> {
    try {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * List all capabilities with stored state for a session.
   */
  async listCapabilities(sessionId: string): Promise<string[]> {
    const safeSession = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sessionDir = join(this.baseDir, safeSession);

    try {
      const entries = await readdir(sessionDir);
      return entries
        .filter(e => e.endsWith('.json'))
        .map(e => e.replace('.json', ''));
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }
}
