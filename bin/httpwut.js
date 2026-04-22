#!/usr/bin/env node
// httpwut — HTTP request debugger, free forever from vøiddo.
// https://voiddo.com/tools/httpwut/

const requester = require('../src/requester');
const { maybeShowPromo, getHelpFooter } = require('../src/promo');
const fs = require('fs');
const path = require('path');

const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const pkg = require('../package.json');
const args = process.argv.slice(2);

function getArg(names, defaultVal = null) {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
      return args[idx + 1];
    }
  }
  return defaultVal;
}

function getAllArgs(names) {
  const results = [];
  for (const name of names) {
    let idx = args.indexOf(name);
    while (idx !== -1) {
      if (args[idx + 1] && !args[idx + 1].startsWith('-')) {
        results.push(args[idx + 1]);
      }
      idx = args.indexOf(name, idx + 1);
    }
  }
  return results;
}

function hasFlag(names) {
  return names.some((name) => args.includes(name));
}

function getUrl() {
  for (const arg of args) {
    if (arg.startsWith('http://') || arg.startsWith('https://')) {
      return arg;
    }
  }
  return null;
}

function parseQueryArgs(qs) {
  const out = {};
  for (const pair of qs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      out[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }
  return out;
}

function parseStatusList(str) {
  return str.split(',').map((c) => parseInt(c.trim(), 10)).filter(Boolean);
}

function encodeBasic(userPass) {
  return 'Basic ' + Buffer.from(userPass).toString('base64');
}

function showHelp() {
  console.log(`
${YELLOW}httpwut${RESET} ${DIM}v${pkg.version}${RESET}
${DIM}HTTP request debugger — free forever from vøiddo${RESET}

${CYAN}Usage:${RESET}
  httpwut <url> [options]

${CYAN}Request:${RESET}
  -X, --method <method>      HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
  -H, --header <header>      Add header (can use multiple times)
  -d, --data <data>          Request body (inline)
  --data-file <path>         Read request body from file (pass '-' for stdin)
  --query <k=v>              Append query param (can use multiple times)
  --bearer <token>           Shortcut for 'Authorization: Bearer <token>'
  -u, --user <user:pass>     Basic auth shortcut

${CYAN}Output:${RESET}
  -o, --output <file>        Save response body to file
  --json                     Emit a single machine-readable JSON envelope
  --curl                     Print equivalent curl command (no request made)
  -v, --verbose              Show everything (headers, body, timing, all)
  --headers-only             Show only response headers
  --body-only                Show only response body (raw, no chrome)
  --status-only              Show only status code (+ proper exit code)
  --timing                   Show DNS/TCP/TLS/wait/download breakdown

${CYAN}Behavior:${RESET}
  -e, --expect <codes>       Expected status codes (comma-separated)
  -L, --follow               Follow redirects (prints the chain)
  --compare <url>            Diff headers / body / timing against another endpoint
  --insecure                 Skip SSL verification
  --timeout <ms>             Request timeout (default 30000)
  --retry <n>                Retry on network errors up to N times (default 0)
  --retry-delay <ms>         Base delay between retries, linear backoff (default 500)
  --retry-on-status <codes>  Also retry on these status codes (e.g. 502,503,504)
  -h, --help                 Show this help
  --version                  Show version

${CYAN}Examples:${RESET}
  httpwut https://api.github.com/users/octocat
  httpwut https://api.example.com -X POST -d '{"name":"test"}'
  httpwut https://api.example.com --bearer \$TOKEN
  httpwut https://api.example.com -u admin:secret --query limit=10 --query page=2
  httpwut https://api.example.com --data-file @./payload.json
  httpwut https://api.example.com --timing
  httpwut https://api.example.com --retry 3 --retry-on-status 502,503,504
  httpwut https://api.example.com --curl              ${DIM}# print curl, do nothing${RESET}
  httpwut https://api.example.com --json | jq .status ${DIM}# machine output${RESET}

${DIM}docs: https://voiddo.com/tools/httpwut/${RESET}${getHelpFooter()}
`);
}

function printBar(label, value, maxValue, width = 20, color = CYAN) {
  if (value == null) return;
  const safeMax = Math.max(maxValue, 1);
  const filled = Math.max(0, Math.min(width, Math.round((value / safeMax) * width)));
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  const padded = (label + ':').padEnd(10);
  console.log(`  ${padded}${color}${bar}${RESET}  ${value}ms`);
}

function emitJsonEnvelope(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

function readBodyFromFile(spec) {
  const target = spec.startsWith('@') ? spec.slice(1) : spec;
  if (target === '-' || target === '@-') {
    return fs.readFileSync(0, 'utf8');
  }
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    throw new Error('data-file not found: ' + target);
  }
  return fs.readFileSync(resolved, 'utf8');
}

async function run() {
  if (hasFlag(['--version'])) {
    console.log(pkg.version);
    return;
  }

  if (hasFlag(['-h', '--help']) || args.length === 0) {
    showHelp();
    return;
  }

  const url = getUrl();
  if (!url) {
    console.error(`${RED}bruh. you need to provide a URL${RESET}`);
    process.exit(1);
  }

  const method = getArg(['-X', '--method'], 'GET').toUpperCase();
  const headerStrings = getAllArgs(['-H', '--header']);
  const headers = requester.parseHeaders(headerStrings);
  let body = getArg(['-d', '--data']);
  const dataFile = getArg(['--data-file']);
  const output = getArg(['-o', '--output']);
  const expectCodes = getArg(['-e', '--expect']);
  const compareUrl = getArg(['--compare']);
  const timeout = parseInt(getArg(['--timeout'], '30000'), 10);
  const retries = parseInt(getArg(['--retry'], '0'), 10);
  const retryDelay = parseInt(getArg(['--retry-delay'], '500'), 10);
  const retryOnStatusRaw = getArg(['--retry-on-status']);
  const retryOnStatus = retryOnStatusRaw ? parseStatusList(retryOnStatusRaw) : [];
  const bearer = getArg(['--bearer']);
  const basicAuth = getArg(['-u', '--user']);
  const queryPairs = getAllArgs(['--query']);

  const follow = hasFlag(['-L', '--follow']);
  const verbose = hasFlag(['-v', '--verbose']);
  const headersOnly = hasFlag(['--headers-only']);
  const bodyOnly = hasFlag(['--body-only']);
  const statusOnly = hasFlag(['--status-only']);
  const showTiming = hasFlag(['--timing']);
  const insecure = hasFlag(['--insecure']);
  const jsonOut = hasFlag(['--json']);
  const curlOut = hasFlag(['--curl']);

  if (dataFile && body) {
    console.error(`${RED}bruh. pick one: --data or --data-file${RESET}`);
    process.exit(2);
  }
  if (dataFile) {
    try {
      body = readBodyFromFile(dataFile);
    } catch (err) {
      console.error(`${RED}${err.message}${RESET}`);
      process.exit(2);
    }
  }

  if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
  if (basicAuth) headers['Authorization'] = encodeBasic(basicAuth);

  if (body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const finalUrl = queryPairs.length
    ? requester.buildUrl(url, parseQueryArgs(queryPairs))
    : url;

  const options = {
    method,
    headers,
    body,
    timeout,
    insecure,
    retries,
    retryDelay,
    retryOnStatus,
  };

  if (curlOut) {
    process.stdout.write(requester.toCurl(finalUrl, options) + '\n');
    return;
  }

  if (!jsonOut && !bodyOnly && !statusOnly) {
    console.log();
    console.log(`  ${YELLOW}httpwut${RESET} ${DIM}— voiddo.com/tools/httpwut${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(28)}${RESET}`);
    if (!headersOnly) {
      console.log(`  ${method} ${finalUrl}`);
      console.log();
    }
  }

  let response;
  try {
    if (follow) {
      response = await requester.followRedirects(finalUrl, options);
      if (!jsonOut && response.redirectChain && response.redirectChain.length > 1) {
        console.log(`  ${CYAN}REDIRECT CHAIN${RESET}`);
        console.log(`  ${DIM}${'─'.repeat(14)}${RESET}`);
        for (const r of response.redirectChain) {
          const color = requester.isSuccess(r.status)
            ? GREEN
            : (r.status >= 300 && r.status < 400 ? YELLOW : RED);
          console.log(`  ${color}${r.status}${RESET} ${r.url}`);
        }
        console.log();
      }
    } else {
      response = await requester.makeRequestWithRetries(finalUrl, options);
    }
  } catch (err) {
    if (jsonOut) {
      emitJsonEnvelope({
        ok: false,
        url: finalUrl,
        error: {
          code: err.code || null,
          message: err.message,
          help: requester.getErrorHelp(err),
        },
      });
      process.exit(1);
    }
    console.log(`  ${RED}ERROR${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(5)}${RESET}`);
    console.log(`  ${requester.getErrorHelp(err)}`);
    console.log();
    process.exit(1);
  }

  if (jsonOut) {
    emitJsonEnvelope({
      ok: requester.isSuccess(response.status),
      url: finalUrl,
      method,
      httpVersion: response.httpVersion,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      timing: response.timing,
      redirectChain: response.redirectChain || null,
      attempts: response.attempts || 1,
      statusHelp: requester.getStatusHelp(response.status),
    });
    process.exit(requester.isSuccess(response.status) ? 0 : 1);
  }

  const statusColor = requester.isSuccess(response.status) ? GREEN : RED;
  const statusIcon = requester.isSuccess(response.status) ? '\u2713' : '\u2717';

  if (statusOnly) {
    console.log(`  ${statusColor}${response.status}${RESET}`);
    console.log();
    process.exit(requester.isSuccess(response.status) ? 0 : 1);
  }

  if (!bodyOnly) {
    console.log(`  ${CYAN}STATUS${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(6)}${RESET}`);
    console.log(`  ${statusColor}${response.status} ${response.statusText} ${statusIcon}${RESET} ${DIM}HTTP/${response.httpVersion}${RESET}`);
    if (response.attempts && response.attempts > 1) {
      console.log(`  ${DIM}(after ${response.attempts} attempts)${RESET}`);
    }
    const statusHelp = requester.getStatusHelp(response.status);
    if (statusHelp) {
      console.log();
      console.log(`  ${statusHelp}`);
    }
    console.log();
  }

  if (!bodyOnly && (showTiming || verbose)) {
    console.log(`  ${CYAN}TIMING${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(6)}${RESET}`);
    const t = response.timing;
    const maxTime = t.total || 1;
    printBar('DNS', t.dns, maxTime, 20, MAGENTA);
    printBar('TCP', t.tcp, maxTime, 20, YELLOW);
    printBar('TLS', t.tls, maxTime, 20, MAGENTA);
    printBar('Wait', t.wait, maxTime, 20, CYAN);
    printBar('TTFB', t.ttfb, maxTime, 20, CYAN);
    printBar('Download', t.download, maxTime, 20, GREEN);
    console.log(`  ${DIM}${'─'.repeat(40)}${RESET}`);
    console.log(`  ${'Total:'.padEnd(10)}${t.total}ms`);
    console.log();
  }

  if (!bodyOnly && (headersOnly || verbose || !statusOnly)) {
    console.log(`  ${CYAN}HEADERS${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(7)}${RESET}`);
    const headerKeys = Object.keys(response.headers);
    const displayHeaders = verbose || headersOnly ? headerKeys : headerKeys.slice(0, 10);
    for (const key of displayHeaders) {
      console.log(`  ${DIM}${key}:${RESET} ${response.headers[key]}`);
    }
    if (!verbose && !headersOnly && headerKeys.length > 10) {
      console.log(`  ${DIM}... and ${headerKeys.length - 10} more${RESET}`);
    }
    console.log();
  }

  if (headersOnly) {
    process.exit(requester.isSuccess(response.status) ? 0 : 1);
  }

  if (bodyOnly || verbose || (!headersOnly && !statusOnly)) {
    const contentType = response.headers['content-type'] || '';
    const isJson = contentType.includes('json');
    let displayBody = response.body;

    if (isJson) {
      displayBody = requester.formatJson(displayBody);
    }

    if (!verbose && !bodyOnly) {
      displayBody = requester.truncate(displayBody, 1000);
    }

    if (!bodyOnly) {
      console.log(`  ${CYAN}BODY${RESET}${response.body.length > 1000 && !verbose ? ' (truncated)' : ''}`);
      console.log(`  ${DIM}${'─'.repeat(4)}${RESET}`);
    }

    const lines = displayBody.split('\n');
    for (const line of lines) {
      console.log(bodyOnly ? line : '  ' + line);
    }
    if (!bodyOnly) console.log();
  }

  if (output) {
    fs.writeFileSync(output, response.body);
    console.log(`  ${GREEN}\u2713${RESET} Saved to ${output}`);
    console.log();
  }

  if (expectCodes) {
    const expected = parseStatusList(expectCodes);
    if (expected.includes(response.status)) {
      console.log(`  ${GREEN}\u2713${RESET} Status ${response.status} matches expected`);
    } else {
      console.log(`  ${RED}\u2717${RESET} Expected ${expectCodes}, got ${response.status}`);
      console.log();
      console.log(`  bruh. that's not what you expected.`);
    }
    console.log();
  }

  if (compareUrl) {
    console.log(`  ${CYAN}COMPARING${RESET}`);
    console.log(`  ${DIM}${'─'.repeat(9)}${RESET}`);
    console.log(`  ${DIM}Fetching: ${compareUrl}${RESET}`);
    console.log();

    try {
      const response2 = await requester.makeRequest(compareUrl, options);
      const diff = requester.compareResponses(response, response2);

      if (diff.status) {
        console.log(`  ${YELLOW}Status differs:${RESET} ${response.status} vs ${response2.status}`);
      } else {
        console.log(`  ${GREEN}Status matches:${RESET} ${response.status}`);
      }

      const headerDiffs = Object.keys(diff.headers);
      if (headerDiffs.length > 0) {
        console.log(`  ${YELLOW}Header differences:${RESET}`);
        for (const key of headerDiffs.slice(0, 5)) {
          console.log(`    ${key}: ${diff.headers[key].first} -> ${diff.headers[key].second}`);
        }
        if (headerDiffs.length > 5) {
          console.log(`    ${DIM}... and ${headerDiffs.length - 5} more${RESET}`);
        }
      } else {
        console.log(`  ${GREEN}Headers match${RESET}`);
      }

      console.log(`  ${diff.bodyMatch ? GREEN + 'Body matches' : YELLOW + 'Body differs'}${RESET}`);
      console.log(`  Timing diff: ${diff.timing.diff > 0 ? '+' : ''}${diff.timing.diff}ms`);
      console.log();
    } catch (err) {
      console.log(`  ${RED}Failed to fetch comparison URL${RESET}`);
      console.log(`  ${requester.getErrorHelp(err)}`);
      console.log();
    }
  }

  maybeShowPromo();
  process.exit(requester.isSuccess(response.status) ? 0 : 1);
}

run().catch((err) => {
  console.error(`  ${RED}bruh. unexpected error: ${err.message}${RESET}`);
  process.exit(1);
});
