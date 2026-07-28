import { z } from 'zod';

const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'ollama',
  'custom',
]);

const ProviderConfigSchema = z.object({
  type: ProviderTypeSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  models: z.array(z.string()).default([]),
  defaultModel: z.string().optional(),
});

export const GlobalConfigSchema = z
  .object({
    defaultProvider: ProviderTypeSchema.optional(),
    defaultModel: z.string().optional(),
    providers: z.record(z.string(), ProviderConfigSchema).default({}),
    theme: z.enum(['dark', 'light', 'auto']).default('auto'),
    debug: z.boolean().default(false),
    maxRetries: z.number().int().min(0).max(10).default(3),
  })
  .default({});

export const ProjectConfigSchema = z.object({
  instructions: z.string().optional(),
  allowedCommands: z.array(z.string()).optional(),
  blockedCommands: z.array(z.string()).optional(),
});

export const CredentialsSchema = z.record(z.string(), z.string());

export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Credentials = z.infer<typeof CredentialsSchema>;

export interface Config {
  global: GlobalConfig;
  project: ProjectConfig;
  credentials: Credentials;
}

export function parseGlobalConfig(raw: unknown): GlobalConfig {
  return GlobalConfigSchema.parse(raw);
}

export function parseProjectConfig(raw: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(raw);
}

export function parseCredentials(raw: unknown): Credentials {
  return CredentialsSchema.parse(raw);
}
