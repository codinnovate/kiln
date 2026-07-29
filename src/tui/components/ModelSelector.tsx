import { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { listModelsByProvider } from '../../models/registry.js';
import type { ModelInfo, ProviderType } from '../../models/provider.js';

interface ModelSelectorProps {
  onSelect: (modelId: string) => void;
  onCancel: () => void;
  currentModel?: string;
}

interface ModelGroup {
  provider: ProviderType;
  label: string;
  models: ModelInfo[];
}

const PROVIDER_ORDER: { type: ProviderType; label: string }[] = [
  { type: 'anthropic', label: 'Anthropic' },
  { type: 'openai', label: 'OpenAI' },
  { type: 'google', label: 'Google' },
  { type: 'openrouter', label: 'OpenRouter' },
  { type: 'zen', label: 'OpenCode Zen' },
  { type: 'ollama', label: 'Ollama (Local)' },
  { type: 'custom', label: 'Custom API' },
];

function buildGroups(): ModelGroup[] {
  return PROVIDER_ORDER.map((p) => ({
    provider: p.type,
    label: p.label,
    models: listModelsByProvider(p.type),
  })).filter((g) => g.models.length > 0);
}

export function ModelSelector({ onSelect, onCancel, currentModel }: ModelSelectorProps) {
  const groups = buildGroups();
  const flatModels = groups.flatMap((g) => g.models);
  const currentIndex = flatModels.findIndex((m) => m.id === currentModel) ?? 0;
  const [selectedIndex, setSelectedIndex] = useState(currentIndex >= 0 ? currentIndex : 0);

  const handleSelect = useCallback(
    (model: ModelInfo) => {
      onSelect(model.id);
    },
    [onSelect],
  );

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(flatModels.length - 1, prev + 1));
      } else if (key.return) {
        handleSelect(flatModels[selectedIndex]);
      } else if (key.escape) {
        onCancel();
      }
    },
    { isActive: true },
  );

  if (flatModels.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">No models available.</Text>
        <Text dimColor>{'Press Escape to cancel.'}</Text>
      </Box>
    );
  }

  let flatIndex = 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        {'Select Model'}
      </Text>
      <Box paddingTop={1} flexDirection="column">
        {groups.map((group) => (
          <Box key={group.provider} flexDirection="column" paddingTop={1}>
            <Text bold color="white">
              {group.label}
            </Text>
            {group.models.map((model) => {
              const isSelected = flatIndex === selectedIndex;
              const isCurrent = model.id === currentModel;
              flatIndex++;

              return (
                <Box key={model.id} paddingLeft={2}>
                  <Text>
                    {isSelected ? (
                      <Text color="cyan" bold>{'● '}</Text>
                    ) : (
                      <Text color="gray">{'○ '}</Text>
                    )}
                    <Text color={isSelected ? 'white' : 'gray'}>
                      {model.name}
                    </Text>
                    {isCurrent ? (
                      <Text color="green">{' (current)'}</Text>
                    ) : null}
                    {model.supportsTools ? null : (
                      <Text color="red">{' (no tools)'}</Text>
                    )}
                    <Text dimColor>{`  [${model.id}]`}</Text>
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Box paddingTop={1}>
        <Text dimColor>{'[↑/↓] Navigate  [Enter] Select  [Esc] Cancel'}</Text>
      </Box>
    </Box>
  );
}
