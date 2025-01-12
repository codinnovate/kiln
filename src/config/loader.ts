import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  CredentialsSchema,
  type Config,
  type GlobalConfig,
  type ProjectConfig,
  type Credentials,
} from './schema.js';

const CONFIG_DIR_NAME = '.kiln';

export function getConfigDir(): string {
  return resolve(homedir(), CONFIG_DIR_NAME);
}

function readJsonFile(filePath: string): unknown | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = resolve(getConfigDir(), 'config.json');
  const raw = readJsonFile(configPath);
  return GlobalConfigSchema.parse(raw ?? {});
}

export function loadProjectConfig(): ProjectConfig {
  const configPath = resolve(process.cwd(), '.kiln', 'config.json');
  const raw = readJsonFile(configPath);
  return ProjectConfigSchema.parse(raw ?? {});
}

export function loadCredentials(): Credentials {
  const credPath = resolve(getConfigDir(), 'credentials.json');
  const raw = readJsonFile(credPath);
  return CredentialsSchema.parse(raw ?? {});
}

export function loadConfig(): Config {
  loadDotenv();

  const global = loadGlobalConfig();
  const project = loadProjectConfig();
  const credentials = loadCredentials();

  return { global, project, credentials };
}
