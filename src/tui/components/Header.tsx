import { Box, Text } from 'ink';

interface HeaderProps {
  model: string;
  version?: string;
}

const WIDTH = 50;

export function Header({ model, version = '0.1.0' }: HeaderProps) {
  const title = `kiln v${version}`;
  const right = model;
  const innerWidth = WIDTH - 4;
  const gap = innerWidth - title.length - right.length;

  return (
    <Box flexDirection="column">
      <Text color="cyan">
        {'╭'}{'─'.repeat(WIDTH - 2)}{'╮'}
      </Text>
      <Text color="cyan">
        {'│ '}
        <Text bold color="white">
          {title}
        </Text>
        {' '.repeat(Math.max(0, gap))}
        <Text color="yellow">{right}</Text>
        {' │'}
      </Text>
      <Text color="cyan">
        {'╰'}{'─'.repeat(WIDTH - 2)}{'╯'}
      </Text>
    </Box>
  );
}
