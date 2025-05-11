import { Text } from 'ink';

interface ToolCallProps {
  name: string;
  args: string;
  isActive?: boolean;
}

function abbreviateArgs(args: string): string {
  if (!args || args === '{}') return '';

  try {
    const parsed = JSON.parse(args);
    const parts: string[] = [];

    const importantKeys = [
      'path',
      'file_path',
      'filePath',
      'command',
      'cmd',
      'input',
      'query',
      'pattern',
      'content',
      'message',
      'branch',
      'url',
    ];

    for (const key of importantKeys) {
      if (parsed[key] !== undefined) {
        const val = String(parsed[key]);
        parts.push(val.length > 50 ? val.slice(0, 47) + '...' : val);
      }
    }

    if (parts.length > 0) return parts.join(' ');

    const firstValues = Object.values(parsed)
      .filter((v) => typeof v === 'string')
      .slice(0, 2)
      .map((v) => {
        const s = String(v);
        return s.length > 40 ? s.slice(0, 37) + '...' : s;
      });

    if (firstValues.length > 0) return firstValues.join(' ');

    return args.length > 50 ? args.slice(0, 47) + '...' : args;
  } catch {
    return args.length > 50 ? args.slice(0, 47) + '...' : args;
  }
}

export function ToolCallView({ name, args, isActive }: ToolCallProps) {
  const abbreviated = abbreviateArgs(args);

  return (
    <Text>
      {isActive ? <Text color="yellow">{'●'}</Text> : <Text color="cyan">{'●'}</Text>}
      <Text bold color="cyan">
        {' '}
        {name}
      </Text>
      {abbreviated ? <Text dimColor> {abbreviated}</Text> : null}
    </Text>
  );
}
