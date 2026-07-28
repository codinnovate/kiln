import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { SessionManager } from '../../sessions/manager.js';
import type { SessionMetadata } from '../../sessions/types.js';

interface SessionSelectorProps {
  onSelect: (sessionId: string) => void;
  onCancel: () => void;
}

export function SessionSelector({ onSelect, onCancel }: SessionSelectorProps) {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const manager = new SessionManager();
    manager
      .listSessions(20)
      .then((list) => {
        setSessions(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const handleSelect = useCallback(
    (session: SessionMetadata) => {
      onSelect(session.id);
    },
    [onSelect],
  );

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
      } else if (key.return && sessions.length > 0) {
        handleSelect(sessions[selectedIndex]);
      } else if (key.escape) {
        onCancel();
      }
    },
    { isActive: !loading },
  );

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading sessions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{`Error: ${error}`}</Text>
        <Text dimColor>{'Press Escape to cancel.'}</Text>
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No sessions found.</Text>
        <Text dimColor>{'Press Escape to cancel.'}</Text>
      </Box>
    );
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        {'Resume Session'}
      </Text>
      <Box paddingTop={1} flexDirection="column">
        {sessions.map((session, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={session.id} paddingLeft={2}>
              <Text>
                {isSelected ? (
                  <Text color="cyan" bold>{'● '}</Text>
                ) : (
                  <Text color="gray">{'○ '}</Text>
                )}
                <Text color={isSelected ? 'white' : 'gray'}>
                  {session.title}
                </Text>
                <Text dimColor>{`  [${session.id.slice(0, 8)}]`}</Text>
              </Text>
              <Box paddingLeft={2}>
                <Text dimColor>
                  {`${formatDate(session.updatedAt)} · ${session.messageCount} msgs · ${session.model}`}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box paddingTop={1}>
        <Text dimColor>{'[↑/↓] Navigate  [Enter] Select  [Esc] Cancel'}</Text>
      </Box>
    </Box>
  );
}
