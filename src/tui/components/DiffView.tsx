import { Box, Text } from 'ink';

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
  lines: DiffLine[];
}

interface DiffViewProps {
  filePath: string;
  hunks?: DiffHunk[];
  content?: string;
}

function parseDiff(content: string): DiffHunk[] {
  const lines = content.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1], 10),
          newStart: parseInt(match[3], 10),
          oldCount: match[2] ? parseInt(match[2], 10) : 1,
          newCount: match[4] ? parseInt(match[4], 10) : 1,
          lines: [],
        };
        hunks.push(currentHunk);
      }
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNum: currentHunk.newStart + currentHunk.lines.filter((l) => l.type !== 'remove').length,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNum: currentHunk.oldStart + currentHunk.lines.filter((l) => l.type !== 'add').length,
      });
    } else {
      currentHunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNum: currentHunk.oldStart + currentHunk.lines.filter((l) => l.type !== 'add').length,
        newLineNum: currentHunk.newStart + currentHunk.lines.filter((l) => l.type !== 'remove').length,
      });
    }
  }

  return hunks;
}

export function DiffView({ filePath, hunks: providedHunks, content }: DiffViewProps) {
  const hunks = providedHunks ?? (content ? parseDiff(content) : []);

  if (hunks.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text dimColor>{`No changes in ${filePath}`}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text>
        <Text color="red">{'---'}</Text>
        <Text color="red"> a/{filePath}</Text>
      </Text>
      <Text>
        <Text color="green">{'+++'}</Text>
        <Text color="green"> b/{filePath}</Text>
      </Text>
      {hunks.map((hunk, hi) => (
        <Box key={hi} flexDirection="column">
          <Text dimColor>
            {`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`}
          </Text>
          {hunk.lines.map((line, li) => {
            if (line.type === 'add') {
              return (
                <Text key={li}>
                  <Text color="green">{'+ '}</Text>
                  <Text color="green">{line.content}</Text>
                </Text>
              );
            }
            if (line.type === 'remove') {
              return (
                <Text key={li}>
                  <Text color="red">{'- '}</Text>
                  <Text color="red">{line.content}</Text>
                </Text>
              );
            }
            return (
              <Text key={li} dimColor>
                {'  '}
                {line.content}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
