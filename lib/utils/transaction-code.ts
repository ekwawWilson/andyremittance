const DAY_PREFIXES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function getTransactionDayPrefix(date: Date): string {
  return DAY_PREFIXES[date.getDay()] ?? 'X';
}

export function generateShortTransactionCode(date: Date, entropy?: string): string {
  const prefix = getTransactionDayPrefix(date);

  if (entropy) {
    const hash = entropy
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .split('')
      .reduce((value, char) => ((value * 31) + char.charCodeAt(0)) % 1000, 0);

    return `${prefix}${String(hash).padStart(3, '0')}`;
  }

  return `${prefix}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

export function generateTransactionCode(
  date: Date,
  type: 'STANDARD' | 'ADDITIONAL' = 'STANDARD',
  shortCode?: string
): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = shortCode ?? generateShortTransactionCode(date);

  const code = `A${day}${month}-${suffix}`;

  return type === 'ADDITIONAL' ? `ADDITIONAL-${code}` : code;
}

export async function generateUniqueTransactionCode(
  date: Date,
  type: 'STANDARD' | 'ADDITIONAL',
  isTaken: (code: string, shortCode: string) => Promise<boolean>,
  maxAttempts: number = 100
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const shortCode = generateShortTransactionCode(date);
    const code = generateTransactionCode(date, type, shortCode);
    if (!(await isTaken(code, shortCode))) {
      return code;
    }
  }

  throw new Error('Failed to generate a unique transaction code');
}

export function transactionCodeTemplate(
  date: Date,
  type: 'STANDARD' | 'ADDITIONAL' = 'STANDARD'
): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const code = `A${day}${month}-${getTransactionDayPrefix(date)}000`;
  return type === 'ADDITIONAL' ? `ADDITIONAL-${code}` : code;
}

export function parseTransactionCode(code: string): {
  isAdditional: boolean;
  day: number;
  month: number;
} {
  const isAdditional = code.startsWith('ADDITIONAL-');
  const baseCode = isAdditional ? code.replace('ADDITIONAL-', '') : code;
  const match = /^A(\d{2})(\d{2})/.exec(baseCode);
  const day = match ? parseInt(match[1], 10) : NaN;
  const month = match ? parseInt(match[2], 10) : NaN;

  return { isAdditional, day, month };
}
