#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFile, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { extractHTML } from './node.js';

type Engine = 'chromium' | 'mozilla';
type Format = 'json' | 'html' | 'text';

interface Arguments {
  input?: string;
  url?: string;
  output?: string;
  engine: Engine;
  format: Format;
  help: boolean;
  version: boolean;
}

const HELP = `Usage: readability-kit <file|-> --url <http(s)://page-address> [options]

Extract an article from a saved HTML file or standard input.
The source URL resolves relative links; this command does not fetch pages.

Options:
  --url <url>             Source page URL (required)
  --engine <engine>       chromium (default) or mozilla
  --format <format>       json (default), html, or text
  --output <file>         Write the result to a file instead of standard output
  -h, --help              Show this help
  -v, --version           Show the package version

Examples:
  readability-kit article.html --url https://example.com/story
  readability-kit - --url https://example.com/story --format text < article.html
  readability-kit article.html --url https://example.com/story --output article.json

HTML output is sanitized by default. Input files are never executed.
Exit codes: 0 success/help, 1 invalid arguments or processing error, 2 no article.
`;

function parseArguments(argv: string[]): Arguments {
  const options: Arguments = {
    engine: 'chromium',
    format: 'json',
    help: false,
    version: false,
  };
  const seen = new Set<string>();
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!positionalOnly && argument === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (argument === '--help' || argument === '-h')) {
      options.help = true;
      continue;
    }
    if (!positionalOnly && (argument === '--version' || argument === '-v')) {
      options.version = true;
      continue;
    }

    if (!positionalOnly && argument.startsWith('--')) {
      const equalsIndex = argument.indexOf('=');
      const name = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
      if (!['--url', '--engine', '--format', '--output'].includes(name)) {
        throw new Error(`Unknown option: ${name}. Use --help for usage.`);
      }
      if (seen.has(name)) {
        throw new Error(`Option ${name} was supplied more than once.`);
      }
      seen.add(name);
      const value = equalsIndex === -1 ? argv[++index] : argument.slice(equalsIndex + 1);
      if (!value || value.startsWith('--')) {
        throw new Error(`Option ${name} requires a value.`);
      }
      if (name === '--url') {
        options.url = value;
      } else if (name === '--output') {
        options.output = value;
      } else if (name === '--engine') {
        if (value !== 'chromium' && value !== 'mozilla') {
          throw new Error('--engine must be chromium or mozilla.');
        }
        options.engine = value;
      } else {
        if (value !== 'json' && value !== 'html' && value !== 'text') {
          throw new Error('--format must be json, html, or text.');
        }
        options.format = value;
      }
      continue;
    }

    if (!positionalOnly && argument !== '-' && argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}. Use -- before a filename beginning with a dash.`);
    }
    if (options.input !== undefined) {
      throw new Error('Supply one HTML file, or - to read standard input.');
    }
    options.input = argument;
  }
  return options;
}

function validateSourceURL(value: string | undefined): string {
  if (!value) {
    throw new Error('--url is required so relative links resolve correctly.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('--url must be an absolute http:// or https:// URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('--url must be an absolute http:// or https:// URL.');
  }
  return url.href;
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function writeOutput(filename: string, output: string): Promise<void> {
  const destination = resolve(filename);
  const temporaryDirectory = await mkdtemp(join(dirname(destination), '.readability-kit-'));
  try {
    const temporaryFile = join(temporaryDirectory, 'result');
    await writeFile(temporaryFile, output, 'utf8');
    await rename(temporaryFile, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main(argv: string[]): Promise<number> {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    const metadata = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: unknown };
    if (typeof metadata.version !== 'string') {
      throw new Error('Unable to read the package version.');
    }
    process.stdout.write(`${metadata.version}\n`);
    return 0;
  }

  if (options.input === undefined) {
    throw new Error('Supply an HTML file, or - to read standard input. Use --help for usage.');
  }
  const url = validateSourceURL(options.url);
  const html = options.input === '-' ? await readStandardInput() : await readFile(options.input, 'utf8');
  const article = extractHTML(html, { url, engine: options.engine });
  if (!article) {
    process.stderr.write('readability-kit: No article was found in this input.\n');
    return 2;
  }

  const output = options.format === 'html'
    ? article.content
    : options.format === 'text'
      ? article.textContent
      : JSON.stringify(article, null, 2);
  const terminatedOutput = output.endsWith('\n') ? output : `${output}\n`;
  if (options.output) {
    await writeOutput(options.output, terminatedOutput);
  } else {
    process.stdout.write(terminatedOutput);
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`readability-kit: ${message}\n`);
    process.exitCode = 1;
  },
);
