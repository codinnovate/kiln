import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PermissionRequest, PermissionDecision } from '../../permissions/types.js';

interface PermissionPromptProps {
  request: PermissionRequest;
  onDecision: (decision: PermissionDecision) => void;
}

type Option = 'allow' | 'allow_always' | 'deny';

const OPTIONS: { value: Option; label: string; color: string }[] = [
  { value: 'allow', label: 'Allow', color: 'green' },
  { value: 'allow_always', label: 'Allow Always', color: 'yellow' },
  { value: 'deny', label: 'Deny', color: 'red' },
];

export function PermissionPrompt({ request, onDecision }: PermissionPromptProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleDecision = useCallback(
    (option: Option) => {
      if (option === 'allow') {
        onDecision({ action: 'allow' });
      } else if (option === 'allow_always') {
        onDecision({ action: 'allow_always' });
      } else {
        onDecision({ action: 'deny' });
      }
    },
    [onDecision],
  );

  useInput(
    (input, key) => {
      if (key.leftArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.rightArrow) {
        setSelectedIndex((prev) => Math.min(OPTIONS.length - 1, prev + 1));
      } else if (key.return) {
        handleDecision(OPTIONS[selectedIndex].value);
      } else if (key.escape) {
        handleDecision('deny');
      } else if (input === '1' || input === 'a') {
        handleDecision('allow');
      } else if (input === '2' || input === 'A') {
        handleDecision('allow_always');
      } else if (input === '3' || input === 'd') {
        handleDecision('deny');
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1}>
      <Text bold color="yellow">
        {'Permission Required'}
      </Text>
      <Box paddingTop={1}>
        <Text>The agent wants to:</Text>
      </Box>
      <Box paddingTop={1} paddingLeft={2}>
        <Text color="white" bold>
          {request.description}
        </Text>
      </Box>
      <Box paddingTop={1}>
        <Text dimColor>{`Target: ${request.target}`}</Text>
      </Box>
      <Box paddingTop={1} gap={2}>
        {OPTIONS.map((opt, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Text
              key={opt.value}
              color={isSelected ? opt.color : 'gray'}
              bold={isSelected}
            >
              {isSelected ? `[${opt.label}]` : ` ${opt.label} `}
            </Text>
          );
        })}
      </Box>
      <Box paddingTop={1}>
        <Text dimColor>{'[←/→] Navigate  [Enter] Select  [Esc] Deny'}</Text>
      </Box>
    </Box>
  );
}
