import { CustomProvider } from './custom.js';
import type { ProviderType } from '../models/provider.js';

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1/chat/completions';

export class ZenProvider extends CustomProvider {
  readonly type: ProviderType = 'zen';
  readonly name: string = 'OpenCode Zen';

  constructor() {
    super(undefined, ZEN_BASE_URL, 'OpenCode Zen');
  }

  validate(): boolean {
    return true;
  }
}
