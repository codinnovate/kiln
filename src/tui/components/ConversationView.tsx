import { useRef, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { MessageView } from './Message.js';
import { ToolCallView } from './ToolCall.js';
import { ToolResultView } from './ToolResult.js';
import { Spinner } from './Spinner.js';
import type { Message } from '../../models/provider.js';

export interface ConversationEntry {
  type: 'message' | 'tool_call' | 'tool_result' | 'error' | 'streaming' | 'thinking';
  message?: Message;
  toolName?: string;
  toolArgs?: string;
  toolContent?: string;
  isError?: boolean;
  text?: string;
  toolCallId?: string;
}

interface ConversationViewProps {
  entries: ConversationEntry[];
  isProcessing: boolean;
  streamingText?: string;
}

export function ConversationView({ entries, isProcessing, streamingText }: ConversationViewProps) {
  const { stdout } = useStdout();
  const scrollRef = useRef(0);
  const containerHeight = Math.max(5, (stdout?.rows ?? 24) - 8);

  useEffect(() => {
    scrollRef.current = Math.max(0, entries.length - containerHeight);
  }, [entries.length, containerHeight]);

  const visibleEntries = entries.slice(scrollRef.current);

  return (
    <Box flexDirection="column" paddingX={1}>
      {visibleEntries.length === 0 && !isProcessing ? (
        <Box paddingY={1}>
          <Text dimColor>{'Start a conversation. Type your message and press Enter.'}</Text>
        </Box>
      ) : (
        visibleEntries.map((entry, i) => {
          const key = `${entry.type}-${i}-${entry.toolCallId ?? ''}`;

          switch (entry.type) {
            case 'message':
              return entry.message ? <MessageView key={key} message={entry.message} /> : null;

            case 'tool_call':
              return (
                <Box key={key} paddingLeft={2} paddingY={0}>
                  <ToolCallView
                    name={entry.toolName ?? ''}
                    args={entry.toolArgs ?? ''}
                    isActive={true}
                  />
                </Box>
              );

            case 'tool_result':
              return (
                <Box key={key} paddingLeft={2} paddingY={0}>
                  <ToolResultView
                    name={entry.toolName ?? ''}
                    content={entry.toolContent ?? ''}
                    isError={entry.isError}
                  />
                </Box>
              );

            case 'error':
              return (
                <Box key={key} paddingLeft={2} paddingY={0}>
                  <Text color="red">{`Error: ${entry.text}`}</Text>
                </Box>
              );

            case 'thinking':
              return (
                <Box key={key} paddingLeft={2} paddingY={0}>
                  <Spinner label={entry.text ?? 'Thinking...'} />
                </Box>
              );

            case 'streaming':
              return null;

            default:
              return null;
          }
        })
      )}

      {streamingText ? (
        <Box paddingLeft={2} paddingTop={1}>
          <Text>{streamingText}</Text>
          <Text color="cyan">{'▎'}</Text>
        </Box>
      ) : null}

      {isProcessing && !streamingText ? (
        <Box paddingLeft={2} paddingTop={1}>
          <Spinner label="Thinking..." />
        </Box>
      ) : null}
    </Box>
  );
}
