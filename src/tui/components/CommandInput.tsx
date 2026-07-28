import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface CommandInputProps {
  onSubmit: (value: string) => void;
  isProcessing: boolean;
  disabled?: boolean;
  history?: string[];
  onHistoryNavigate?: (direction: 'up' | 'down') => string | null;
  onCancel?: () => void;
}

export function CommandInput({
  onSubmit,
  isProcessing,
  disabled = false,
  history = [],
  onHistoryNavigate,
  onCancel,
}: CommandInputProps) {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pendingValue, setPendingValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isProcessing || disabled) return;
    onSubmit(trimmed);
    setValue('');
    setHistoryIndex(-1);
    setPendingValue('');
  }, [value, isProcessing, disabled, onSubmit]);

  useInput(
    (input, key) => {
      if (disabled || isProcessing) return;

      if (key.return) {
        if (value.endsWith('\\')) {
          setValue((prev) => prev.slice(0, -1) + '\n');
          return;
        }
        handleSubmit();
        return;
      }

      if (key.escape) {
        setValue('');
        setHistoryIndex(-1);
        return;
      }

      if (key.upArrow) {
        if (onHistoryNavigate && history.length > 0) {
          const newIndex = historyIndex + 1;
          if (newIndex < history.length) {
            if (historyIndex === -1) {
              setPendingValue(value);
            }
            setHistoryIndex(newIndex);
            const histValue = onHistoryNavigate('up');
            if (histValue !== null) setValue(histValue);
          }
        }
        return;
      }

      if (key.downArrow) {
        if (onHistoryNavigate && historyIndex >= 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          if (newIndex === -1) {
            setValue(pendingValue);
          } else {
            const histValue = onHistoryNavigate('down');
            if (histValue !== null) setValue(histValue);
          }
        }
        return;
      }

      if (key.ctrl && input === 'c') {
        if (onCancel) {
          onCancel();
        } else if (isProcessing) {
          return;
        } else {
          process.exit(0);
        }
      }

      if (key.delete || key.backspace) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      if (input) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !disabled && !isProcessing },
  );

  const displayLines = value.split('\n');
  const lastLine = displayLines[displayLines.length - 1] ?? '';

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          {'> '}
        </Text>
        <Text>{lastLine}</Text>
        {!isProcessing && !disabled ? <Text color="cyan">{'▎'}</Text> : null}
      </Box>
      {displayLines.length > 1
        ? displayLines.slice(0, -1).map((line, i) => (
            <Box key={i}>
              <Text dimColor>{'  '}</Text>
              <Text>{line}</Text>
            </Box>
          ))
        : null}
    </Box>
  );
}
