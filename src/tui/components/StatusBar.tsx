import { Box, Text } from 'ink';

interface StatusBarProps {
  model: string;
  messageCount: number;
  version?: string;
  debug?: boolean;
  usage?: { input: number; output: number };
}

export function StatusBar({
  model,
  messageCount,
  version = '0.1.0',
  debug = false,
  usage,
}: StatusBarProps) {
  const modelShort = model.includes('/') ? model.split('/').pop() ?? model : model;

  return (
    <Box
      borderTop={true}
      borderColor="gray"
      paddingTop={0}
      justifyContent="space-between"
      paddingX={1}
    >
      <Text dimColor>
        {'kiln v'}
        {version}
        {' │ '}
        {modelShort}
        {' │ '}
        {messageCount}
        {' messages'}
      </Text>
      <Text dimColor>
        {debug && usage
          ? `${usage.input.toLocaleString()} in / ${usage.output.toLocaleString()} out`
          : '/help for commands'}
      </Text>
    </Box>
  );
}
