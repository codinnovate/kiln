import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useStdin } from 'ink';
import { Header } from './components/Header.js';
import { ConversationView } from './components/ConversationView.js';
import { CommandInput } from './components/CommandInput.js';
import { StatusBar } from './components/StatusBar.js';
import { PermissionPrompt } from './components/PermissionPrompt.js';
import { ModelSelector } from './components/ModelSelector.js';
import { useAgent } from './hooks/useAgent.js';
import { getModel } from '../models/registry.js';
import { resolveModelAlias } from '../models/aliases.js';
import type { AgentConfig } from '../agent/types.js';
import type { PermissionRequest, PermissionDecision } from '../permissions/types.js';

interface AppProps {
  cwd: string;
  model?: string;
  sessionId?: string;
  debug?: boolean;
  autoApprove?: boolean;
}

type AppMode = 'chat' | 'model_select' | 'permission';

interface PendingPermission {
  request: PermissionRequest;
  resolve: (decision: PermissionDecision) => void;
}

const VERSION = '0.1.0';

export function App({ cwd, model, sessionId, debug, autoApprove }: AppProps) {
  const { exit } = useApp();
  useStdin();

  const initialModel = resolveModelAlias(model ?? 'claude-sonnet');
  const [currentModel, setCurrentModel] = useState(initialModel);
  const [mode, setMode] = useState<AppMode>('chat');
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const modelInfo = getModel(currentModel);
  const displayName = modelInfo?.name ?? currentModel.split('/').pop() ?? currentModel;

  const agentConfig: AgentConfig = {
    model: currentModel,
    provider: modelInfo?.provider ?? 'openai',
    cwd,
    maxIterations: 20,
    debug: debug ?? false,
  };

  const handlePermissionRequest = useCallback(
    async (request: PermissionRequest): Promise<PermissionDecision> => {
      if (autoApprove) {
        return { action: 'allow' };
      }

      return new Promise<PermissionDecision>((resolve) => {
        setPendingPermission({ request, resolve });
        setMode('permission');
      });
    },
    [autoApprove],
  );

  const {
    entries,
    messages,
    isProcessing,
    streamingText,
    usage,
    chat,
    reset,
  } = useAgent({ config: agentConfig, onPermissionRequest: handlePermissionRequest });

  const handleCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();

      if (trimmed === '/help') {
        setStatusMessage(
          'Commands: /help, /model, /clear, /compact, /context, /status, /quit',
        );
        return true;
      }

      if (trimmed === '/model') {
        setMode('model_select');
        return true;
      }

      if (trimmed === '/clear') {
        reset();
        setStatusMessage('Conversation cleared.');
        return true;
      }

      if (trimmed === '/compact') {
        setStatusMessage('Compaction not yet implemented.');
        return true;
      }

      if (trimmed === '/context') {
        setStatusMessage(`Working directory: ${cwd}`);
        return true;
      }

      if (trimmed === '/status') {
        const msg = [
          `Model: ${displayName}`,
          `Messages: ${messages.length}`,
          `Usage: ${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out`,
          `Debug: ${debug ? 'on' : 'off'}`,
          `Auto-approve: ${autoApprove ? 'on' : 'off'}`,
        ].join(' | ');
        setStatusMessage(msg);
        return true;
      }

      if (trimmed === '/quit' || trimmed === '/exit') {
        exit();
        return true;
      }

      return false;
    },
    [cwd, displayName, messages.length, usage, debug, autoApprove, reset, exit],
  );

  const handleInputSubmit = useCallback(
    (value: string) => {
      if (statusMessage) {
        setStatusMessage(null);
      }

      if (value.startsWith('/')) {
        const handled = handleCommand(value);
        if (handled) return;
      }

      setInputHistory((prev) => [...prev, value]);
      chat(value);
    },
    [handleCommand, chat, statusMessage],
  );

  const handlePermissionDecision = useCallback(
    (decision: PermissionDecision) => {
      if (pendingPermission) {
        pendingPermission.resolve(decision);
        setPendingPermission(null);
        setMode('chat');
      }
    },
    [pendingPermission],
  );

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setCurrentModel(modelId);
      setMode('chat');
      setStatusMessage(`Model changed to ${getModel(modelId)?.name ?? modelId}`);
    },
    [],
  );

  const handleModelCancel = useCallback(() => {
    setMode('chat');
  }, []);

  useEffect(() => {
    if (mode === 'chat' && isProcessing === false) {
      // Re-enable input
    }
  }, [mode, isProcessing]);

  return (
    <Box flexDirection="column" minHeight={10}>
      <Header model={displayName} version={VERSION} />

      <Box flexGrow={1} flexDirection="column">
        <ConversationView
          entries={entries}
          isProcessing={isProcessing}
          streamingText={streamingText}
        />

        {statusMessage && !isProcessing ? (
          <Box paddingLeft={2} paddingTop={1}>
            <Text color="cyan">{statusMessage}</Text>
          </Box>
        ) : null}
      </Box>

      {mode === 'permission' && pendingPermission ? (
        <PermissionPrompt
          request={pendingPermission.request}
          onDecision={handlePermissionDecision}
        />
      ) : mode === 'model_select' ? (
        <ModelSelector
          onSelect={handleModelSelect}
          onCancel={handleModelCancel}
          currentModel={currentModel}
        />
      ) : (
        <CommandInput
          onSubmit={handleInputSubmit}
          isProcessing={isProcessing}
          disabled={mode !== 'chat'}
        />
      )}

      <StatusBar
        model={displayName}
        messageCount={messages.length}
        version={VERSION}
        debug={debug}
        usage={usage}
      />
    </Box>
  );
}
