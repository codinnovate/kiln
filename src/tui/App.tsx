import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useStdin, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { ConversationView } from './components/ConversationView.js';
import { CommandInput } from './components/CommandInput.js';
import { StatusBar } from './components/StatusBar.js';
import { PermissionPrompt } from './components/PermissionPrompt.js';
import { ModelSelector } from './components/ModelSelector.js';
import { SessionSelector } from './components/SessionSelector.js';
import { useAgent } from './hooks/useAgent.js';
import { getModel } from '../models/registry.js';
import { resolveModelAlias } from '../models/aliases.js';
import { SessionManager } from '../sessions/manager.js';
import type { AgentConfig } from '../agent/types.js';
import type { PermissionRequest, PermissionDecision } from '../permissions/types.js';

interface AppProps {
  cwd: string;
  model?: string;
  sessionId?: string;
  debug?: boolean;
  autoApprove?: boolean;
}

type AppMode = 'chat' | 'model_select' | 'permission' | 'session_select';

interface PendingPermission {
  request: PermissionRequest;
  resolve: (decision: PermissionDecision) => void;
}

const VERSION = '0.1.0';

const MAX_DISPLAY_LENGTH = 500;
const MIN_TERMINAL_ROWS = 8;
const MIN_TERMINAL_COLS = 40;

export function App({ cwd, model, sessionId: _sessionId, debug, autoApprove }: AppProps) {
  const { exit } = useApp();
  useStdin();
  const { stdout } = useStdout();

  const initialModel = resolveModelAlias(model ?? 'claude-sonnet');
  const [currentModel, setCurrentModel] = useState(initialModel);
  const [mode, setMode] = useState<AppMode>('chat');
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [_inputHistory, setInputHistory] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;
  const isSmallTerminal = termRows < MIN_TERMINAL_ROWS || termCols < MIN_TERMINAL_COLS;

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
    loadSession,
    cancel,
  } = useAgent({ config: agentConfig, onPermissionRequest: handlePermissionRequest });

  const handleCommand = useCallback(
    (command: string) => {
      const trimmed = command.trim();

      if (trimmed === '/help') {
        const helpLines = [
          'Available commands:',
          '  /help     - Show this help message',
          '  /model    - Change the current model',
          '  /resume   - Resume a previous session',
          '  /clear    - Clear conversation history',
          '  /compact  - Compact conversation (not yet implemented)',
          '  /context  - Show current working directory',
          '  /status   - Show session status',
          '  /quit     - Exit kiln (alias: /exit)',
        ];
        setStatusMessage(helpLines.join('\n'));
        return true;
      }

      if (trimmed === '/model') {
        setMode('model_select');
        return true;
      }

      if (trimmed === '/resume') {
        setMode('session_select');
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

      const trimmed = value.trim();
      if (!trimmed) return;

      setInputHistory((prev) => [...prev, trimmed]);
      chat(trimmed);
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

  const handleSessionSelect = useCallback(
    async (sessionId: string) => {
      setMode('chat');
      try {
        const manager = new SessionManager();
        const session = await manager.resumeSession(sessionId);
        const modelInfo = getModel(session.metadata.model);
        if (modelInfo) {
          setCurrentModel(session.metadata.model);
        }
        loadSession(session.messages, session.state?.totalTokens);
        setStatusMessage(
          `Resumed "${session.metadata.title}" · ${session.messages.length} messages loaded`,
        );
      } catch (err) {
        setStatusMessage(`Failed to resume: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [loadSession],
  );

  const handleSessionCancel = useCallback(() => {
    setMode('chat');
  }, []);

  const handleCancel = useCallback(() => {
    if (isProcessing) {
      cancel();
    } else {
      process.exit(0);
    }
  }, [isProcessing, cancel]);

  useEffect(() => {
    if (mode === 'chat' && isProcessing === false) {
      // Re-enable input
    }
  }, [mode, isProcessing]);

  return (
    <Box flexDirection="column" minHeight={MIN_TERMINAL_ROWS}>
      {isSmallTerminal ? (
        <Box padding={1}>
          <Text color="yellow">
            {'Terminal too small. Resize to at least '}
            {MIN_TERMINAL_COLS}
            {'x'}
            {MIN_TERMINAL_ROWS}
            {'.'}
          </Text>
        </Box>
      ) : (
        <>
          <Header model={displayName} version={VERSION} />

          <Box flexGrow={1} flexDirection="column">
            <ConversationView
              entries={entries}
              isProcessing={isProcessing}
              streamingText={streamingText}
              maxDisplayLength={MAX_DISPLAY_LENGTH}
            />

            {statusMessage && !isProcessing ? (
              <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
                {statusMessage.split('\n').map((line, i) => (
                  <Text key={i} color="cyan">
                    {line}
                  </Text>
                ))}
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
          ) : mode === 'session_select' ? (
            <SessionSelector
              onSelect={handleSessionSelect}
              onCancel={handleSessionCancel}
            />
          ) : (
            <CommandInput
              onSubmit={handleInputSubmit}
              isProcessing={isProcessing}
              disabled={mode !== 'chat'}
              onCancel={handleCancel}
            />
          )}

          <StatusBar
            model={displayName}
            messageCount={messages.length}
            version={VERSION}
            debug={debug}
            usage={usage}
          />
        </>
      )}
    </Box>
  );
}
