/**
 * Terminal I/O Utilities
 *
 * Wraps node:readline/promises for interactive CLI prompting.
 * Provides styled output helpers for consistent formatting.
 */

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// ─── Readline Factory ─────────────────────────────────────────

export function createPrompt(): Interface {
  return createInterface({ input: stdin, output: stdout });
}

// ─── Prompt Functions ─────────────────────────────────────────

export interface AskOptions {
  required?: boolean;
  defaultValue?: string;
  validate?: (value: string) => string | null;
}

/**
 * Ask a question and return the trimmed answer.
 * Loops until a valid, non-empty answer is given when required.
 */
export async function ask(rl: Interface, question: string, opts: AskOptions = {}): Promise<string> {
  const { required = false, defaultValue, validate } = opts;
  const suffix = defaultValue ? ` [${defaultValue}]` : '';

  for (;;) {
    const raw = await rl.question(`${question}${suffix}: `);
    const value = raw.trim() || defaultValue || '';

    if (required && !value) {
      printWarning('This field is required. Please enter a value.');
      continue;
    }

    if (validate) {
      const error = validate(value);
      if (error) {
        printWarning(error);
        continue;
      }
    }

    return value;
  }
}

/**
 * Ask for a secret value (e.g., API token).
 * Masks input by switching to raw mode.
 */
export async function askSecret(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const input = rl.terminal ? stdin : stdin;

    stdout.write(`${question}: `);

    if (!stdin.isTTY) {
      // Non-interactive: fall back to regular readline
      void rl.question('').then((answer) => resolve(answer.trim()));
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();

    let secret = '';

    const onData = (data: Buffer) => {
      const char = data.toString();

      if (char === '\n' || char === '\r' || char === '\u0004') {
        // Enter or Ctrl+D
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(secret.trim());
      } else if (char === '\u0003') {
        // Ctrl+C
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        rl.close();
        process.exit(0);
      } else if (char === '\u007F' || char === '\b') {
        // Backspace
        if (secret.length > 0) {
          secret = secret.slice(0, -1);
          stdout.write('\b \b');
        }
      } else if (char.charCodeAt(0) >= 32) {
        secret += char;
        stdout.write('*');
      }
    };

    // Ignore the unused variable warning — input is used for clarity
    void input;
    stdin.on('data', onData);
  });
}

/**
 * Ask for a comma-separated list of emails.
 * Validates each email has an @ sign.
 */
export async function askEmails(rl: Interface, question: string): Promise<string[]> {
  for (;;) {
    const raw = await rl.question(`${question}: `);
    const emails = raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      printWarning('Please enter at least one email address.');
      continue;
    }

    const invalid = emails.filter((e) => !e.includes('@'));
    if (invalid.length > 0) {
      printWarning(`Invalid email(s): ${invalid.join(', ')}`);
      continue;
    }

    return emails;
  }
}

/**
 * Ask a yes/no question. Returns true for yes.
 */
export async function askConfirm(
  rl: Interface,
  question: string,
  defaultYes = true
): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const raw = await rl.question(`${question} ${hint}: `);
  const answer = raw.trim().toLowerCase();

  if (!answer) return defaultYes;
  return answer === 'y' || answer === 'yes';
}

// ─── Styled Output ───────────────────────────────────────────

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function printHeader(text: string): void {
  console.log(`\n${BOLD}${CYAN}${text}${RESET}`);
  console.log(`${DIM}${'─'.repeat(text.length)}${RESET}`);
}

export function printSuccess(text: string): void {
  console.log(`${GREEN}[ok]${RESET} ${text}`);
}

export function printWarning(text: string): void {
  console.log(`${YELLOW}[!]${RESET} ${text}`);
}

export function printInfo(text: string): void {
  console.log(`${DIM}[i]${RESET} ${text}`);
}

export function printError(text: string): void {
  console.log(`${RED}[error]${RESET} ${text}`);
}

export function printStep(step: number, total: number, text: string): void {
  console.log(`\n${BOLD}[${step}/${total}]${RESET} ${text}`);
}
