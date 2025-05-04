import { useState, useEffect } from 'react';
import { Text } from 'ink';

interface SpinnerProps {
  label?: string;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner({ label }: SpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color="cyan">{FRAMES[frame]}</Text>
      {label ? <Text dimColor> {label}</Text> : null}
    </Text>
  );
}
