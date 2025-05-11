import { Text } from 'ink';

interface ToolResultProps {
  name: string;
  content: string;
  isError?: boolean;
}

function summarizeResult(content: string, isError: boolean): string {
  if (isError) {
    const firstLine = content.split('\n')[0] ?? content;
    return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
  }

  const lines = content.split('\n');
  const lineCount = lines.length;

  if (lineCount === 1) {
    const trimmed = content.trim();
    if (trimmed.length > 60) return trimmed.slice(0, 57) + '...';
    return trimmed;
  }

  return `${lineCount} lines`;
}

export function ToolResultView({ name, content, isError }: ToolResultProps) {
  const summary = summarizeResult(content, isError ?? false);

  return (
    <Text>
      {isError ? (
        <Text color="red">{'✗'}</Text>
      ) : (
        <Text color="green">{'✓'}</Text>
      )}
      <Text bold> {name}</Text>
      <Text dimColor> {summary}</Text>
    </Text>
  );
}
