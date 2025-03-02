const CODE_CHARS_PER_TOKEN = 3.5;
const TEXT_CHARS_PER_TOKEN = 4.0;
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt', '.scala',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.sql', '.graphql', '.gql',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm', '.xml', '.svg',
  '.yaml', '.yml', '.toml', '.json', '.jsonc',
  '.md', '.mdx', '.txt',
  '.dockerfile', '.makefile',
]);

function isCodeFile(text: string, filename?: string): boolean {
  if (filename) {
    const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
    return CODE_EXTENSIONS.has(ext.toLowerCase());
  }

  const codeIndicators = [
    /^(import|export|from|const|let|var|function|class|interface|type|enum|struct|def|fn|func|pub|async|await)\s/m,
    /[{}\[\]();]/,
    /=>|->|\|\||&&/,
    /^\s*(\/\/|#|\/\*|\*\/)/m,
  ];
  let score = 0;
  for (const pattern of codeIndicators) {
    if (pattern.test(text)) score++;
  }
  return score >= 2;
}

export function estimateTokens(text: string, filename?: string): number {
  if (!text || text.length === 0) return 0;

  const charsPerToken = isCodeFile(text, filename) ? CODE_CHARS_PER_TOKEN : TEXT_CHARS_PER_TOKEN;
  const baseEstimate = Math.ceil(text.length / charsPerToken);

  const lines = text.split('\n');
  const lineOverhead = lines.length * 0.5;

  return Math.ceil(baseEstimate + lineOverhead);
}

export function truncateToTokens(text: string, maxTokens: number, filename?: string): string {
  if (maxTokens <= 0) return '';
  if (!text) return '';

  const charsPerToken = isCodeFile(text, filename) ? CODE_CHARS_PER_TOKEN : TEXT_CHARS_PER_TOKEN;
  const maxChars = Math.floor(maxTokens * charsPerToken);

  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const safeCutoff = lastNewline > maxChars * 0.8 ? lastNewline : maxChars;

  return truncated.slice(0, safeCutoff) + '\n\n... [truncated]';
}
