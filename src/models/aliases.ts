export const MODEL_ALIASES: Record<string, string> = {
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-5': 'openai/gpt-5',
  'claude-sonnet': 'anthropic/claude-sonnet-4-20250514',
  'claude-haiku': 'anthropic/claude-3-5-haiku-20241022',
  'claude-opus': 'anthropic/claude-opus-4-20250514',
  gemini: 'google/gemini-2.5-flash',
  'gemini-pro': 'google/gemini-2.5-pro',
};

export function resolveModelAlias(alias: string): string {
  return MODEL_ALIASES[alias] ?? alias;
}
