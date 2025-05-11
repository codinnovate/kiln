import { Box, Text } from 'ink';
import type { Message as AgentMessage } from '../../models/provider.js';

interface MessageProps {
  message: AgentMessage;
  maxLines?: number;
}

function getStringContent(content: AgentMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('');
}

function renderMarkdownLite(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <Box key={`code-${i}`} flexDirection="column" paddingLeft={2}>
            {codeLines.map((cl, ci) => (
              <Text key={ci} color="gray">
                {cl}
              </Text>
            ))}
          </Box>,
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <Text key={i} bold color="white">
          {line.slice(2)}
          {'\n'}
        </Text>,
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <Text key={i} bold color="white">
          {line.slice(3)}
          {'\n'}
        </Text>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <Text key={i}>
          <Text color="cyan">  • </Text>
          {renderInlineFormatting(line.slice(2))}
          {'\n'}
        </Text>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+\.\s)(.*)/);
      if (match) {
        elements.push(
          <Text key={i}>
            <Text color="cyan">  {match[1]}</Text>
            {renderInlineFormatting(match[2])}
            {'\n'}
          </Text>,
        );
      }
    } else if (line.startsWith('> ')) {
      elements.push(
        <Text key={i} color="gray">
          {'  │ '}
          {renderInlineFormatting(line.slice(2))}
          {'\n'}
        </Text>,
      );
    } else {
      elements.push(
        <Text key={i}>
          {renderInlineFormatting(line)}
          {'\n'}
        </Text>,
      );
    }
  }

  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <Box key="code-end" flexDirection="column" paddingLeft={2}>
        {codeLines.map((cl, ci) => (
          <Text key={ci} color="gray">
            {cl}
          </Text>
        ))}
      </Box>,
    );
  }

  return elements;
}

function renderInlineFormatting(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(
        <Text key={match.index} color="yellow">
          {match[1]}
        </Text>,
      );
    } else if (match[2]) {
      parts.push(
        <Text key={match.index} bold>
          {match[2].slice(2, -2)}
        </Text>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

const MAX_LINES = 100;

export function MessageView({ message, maxLines = MAX_LINES }: MessageProps) {
  if (message.role === 'system') return null;

  const text = getStringContent(message.content);
  if (!text.trim()) return null;

  const lines = text.split('\n');
  const isTruncated = lines.length > maxLines;
  const displayText = isTruncated ? lines.slice(0, maxLines).join('\n') : text;

  if (message.role === 'user') {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Box>
          <Text bold color="blue">
            {'You'}
          </Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>{renderMarkdownLite(displayText)}</Text>
        </Box>
        {isTruncated ? (
          <Text dimColor color="yellow">
            {'  [truncated: '}
            {lines.length}
            {' total lines]'}
          </Text>
        ) : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text bold color="green">
          {'Agent'}
        </Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{renderMarkdownLite(displayText)}</Text>
      </Box>
      {isTruncated ? (
        <Text dimColor color="yellow">
          {'  [truncated: '}
          {lines.length}
          {' total lines]'}
        </Text>
      ) : null}
    </Box>
  );
}
