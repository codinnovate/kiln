import { render } from 'ink';
import { App } from './App.js';

export interface TUIOptions {
  cwd: string;
  model?: string;
  sessionId?: string;
  debug?: boolean;
  autoApprove?: boolean;
}

export function startTUI(options: TUIOptions) {
  const { unmount, waitUntilExit } = render(
    <App
      cwd={options.cwd}
      model={options.model}
      sessionId={options.sessionId}
      debug={options.debug}
      autoApprove={options.autoApprove}
    />,
  );

  return { unmount, waitUntilExit };
}
