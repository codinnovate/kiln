import { useState, useCallback, useRef } from 'react';

interface UseInputOptions {
  history?: string[];
  maxHistory?: number;
}

export function useTextInput(options: UseInputOptions = {}) {
  const { history: externalHistory, maxHistory = 100 } = options;
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const savedInputRef = useRef('');
  const internalHistory = useRef<string[]>([]);

  const history = externalHistory ?? internalHistory.current;

  const appendToHistory = useCallback(
    (entry: string) => {
      if (externalHistory) return;
      if (entry.trim()) {
        internalHistory.current = [entry, ...internalHistory.current].slice(0, maxHistory);
      }
    },
    [externalHistory, maxHistory],
  );

  const handleCharInput = useCallback((input: string) => {
    setValue((prev) => prev + input);
    setHistoryIndex(-1);
  }, []);

  const handleBackspace = useCallback(() => {
    setValue((prev) => prev.slice(0, -1));
    setHistoryIndex(-1);
  }, []);

  const handleSubmit = useCallback((): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    appendToHistory(trimmed);
    setValue('');
    setHistoryIndex(-1);
    savedInputRef.current = '';
    return trimmed;
  }, [value, appendToHistory]);

  const handleHistoryUp = useCallback((): string | null => {
    if (history.length === 0) return null;
    const newIndex = historyIndex + 1;
    if (newIndex >= history.length) return null;
    if (historyIndex === -1) {
      savedInputRef.current = value;
    }
    setHistoryIndex(newIndex);
    return history[newIndex] ?? null;
  }, [historyIndex, history, value]);

  const handleHistoryDown = useCallback((): string | null => {
    if (historyIndex < 0) return null;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    if (newIndex === -1) {
      return savedInputRef.current;
    }
    return history[newIndex] ?? null;
  }, [historyIndex, history]);

  const handleClear = useCallback(() => {
    setValue('');
    setHistoryIndex(-1);
    savedInputRef.current = '';
  }, []);

  const handleCancel = useCallback(() => {
    if (value) {
      setValue('');
      setHistoryIndex(-1);
    }
  }, [value]);

  return {
    value,
    setValue,
    handleCharInput,
    handleBackspace,
    handleSubmit,
    handleHistoryUp,
    handleHistoryDown,
    handleClear,
    handleCancel,
    historyIndex,
    history,
  };
}
