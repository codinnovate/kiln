import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentConfig } from '../../agent/types.js';
import type { Message } from '../../models/provider.js';
import type { PermissionRequest, PermissionDecision } from '../../permissions/types.js';
import type { ConversationEntry } from '../components/ConversationView.js';

interface UseAgentOptions {
  config: AgentConfig;
  onPermissionRequest?: (request: PermissionRequest) => Promise<PermissionDecision>;
}

interface UseAgentReturn {
  entries: ConversationEntry[];
  messages: Message[];
  isProcessing: boolean;
  streamingText: string;
  error: string | null;
  usage: { input: number; output: number };
  activeTools: string[];
  chat: (message: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  setModel: (model: string) => void;
}

export function useAgent({ config, onPermissionRequest }: UseAgentOptions): UseAgentReturn {
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState({ input: 0, output: 0 });
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsProcessing(false);
    setStreamingText('');
  }, []);

  const reset = useCallback(() => {
    cancel();
    setEntries([]);
    setMessages([]);
    setError(null);
    setUsage({ input: 0, output: 0 });
    setActiveTools([]);
  }, [cancel]);

  const setModel = useCallback((_model: string) => {
    // Model changes are reflected via config ref
  }, []);

  const chat = useCallback(
    async (userMessage: string) => {
      const agentConfig = configRef.current;

      const userEntry: ConversationEntry = {
        type: 'message',
        message: { role: 'user', content: userMessage },
      };

      setEntries((prev) => [...prev, userEntry]);
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
      setIsProcessing(true);
      setStreamingText('');
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulatedText = '';

      try {
        const { AgentLoop } = await import('../../agent/loop.js');
        const { createDefaultTools } = await import('../../tools/index.js');
        const { ContextEngine } = await import('../../context/engine.js');
        const { PermissionManager } = await import('../../permissions/manager.js');
        const { createProviderFromConfig } = await import('../../providers/index.js');
        const { loadConfig } = await import('../../config/loader.js');

        const globalConfig = loadConfig();
        const provider = createProviderFromConfig(globalConfig, agentConfig.model);
        const tools = createDefaultTools();
        const context = new ContextEngine(agentConfig.cwd);
        const permissions = new PermissionManager({
          autoApprove: agentConfig.debug,
          onPrompt: onPermissionRequest,
        });

        const agent = new AgentLoop(provider, tools, context, permissions, agentConfig);
        await agent.initialize();

        for await (const event of agent.chat(userMessage)) {
          if (controller.signal.aborted) break;

          switch (event.type) {
            case 'text': {
              const data = event.data as { text: string; accumulated: string };
              accumulatedText = data.accumulated;
              setStreamingText(accumulatedText);
              break;
            }

            case 'tool_call': {
              const data = event.data as {
                id: string;
                name: string;
                arguments: string;
              };
              if (accumulatedText) {
                setEntries((prev) => [
                  ...prev,
                  {
                    type: 'message',
                    message: { role: 'assistant', content: accumulatedText },
                  },
                ]);
                accumulatedText = '';
                setStreamingText('');
              }

              setActiveTools((prev) => [...prev, data.name]);
              setEntries((prev) => [
                ...prev,
                {
                  type: 'tool_call',
                  toolName: data.name,
                  toolArgs: data.arguments,
                  toolCallId: data.id,
                },
              ]);
              break;
            }

            case 'tool_result': {
              const data = event.data as {
                id: string;
                name: string;
                content: string;
                isError: boolean;
              };
              setActiveTools((prev) => prev.filter((t) => t !== data.name));
              setEntries((prev) => [
                ...prev,
                {
                  type: 'tool_result',
                  toolName: data.name,
                  toolContent: data.content,
                  isError: data.isError,
                  toolCallId: data.id,
                },
              ]);
              break;
            }

            case 'usage': {
              const data = event.data as { input: number; output: number };
              setUsage({ ...data });
              break;
            }

            case 'error': {
              const data = event.data as { message: string };
              setError(data.message);
              setEntries((prev) => [
                ...prev,
                {
                  type: 'error',
                  text: data.message,
                },
              ]);
              break;
            }

            case 'thinking': {
              const data = event.data as { message: string };
              setEntries((prev) => [
                ...prev,
                {
                  type: 'thinking',
                  text: data.message,
                },
              ]);
              break;
            }

            case 'done':
              break;
          }
        }

        if (accumulatedText) {
          setEntries((prev) => [
            ...prev,
            {
              type: 'message',
              message: { role: 'assistant', content: accumulatedText },
            },
          ]);
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: accumulatedText },
          ]);
          setStreamingText('');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setEntries((prev) => [...prev, { type: 'error', text: message }]);
      } finally {
        setIsProcessing(false);
        setStreamingText('');
        abortRef.current = null;
      }
    },
    [onPermissionRequest],
  );

  return {
    entries,
    messages,
    isProcessing,
    streamingText,
    error,
    usage,
    activeTools,
    chat,
    cancel,
    reset,
    setModel,
  };
}
