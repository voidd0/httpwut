# httpwut

**HTTP request debugger for humans.** "Why isn't my request working?" — this tool answers that, loud and specific, in under a second.

Free forever gift from [vøiddo](https://voiddo.com).

```
┌───────────────────────────────────────┐
│  httpwut https://api.example.com      │
│                                       │
│  STATUS   401 Unauthorized ✗          │
│  bruh. unauthorized. missing or bad   │
│  auth credentials.                    │
│                                       │
│  TIMING                               │
│  DNS   ███░░░░░░░░░░░░░░░   14ms     │
│  TCP   █░░░░░░░░░░░░░░░░░    4ms     │
│  TLS   ████░░░░░░░░░░░░░░   19ms     │
│  TTFB  ██████████████░░░░   78ms     │
│  Total                      124ms     │
└───────────────────────────────────────┘
```

## Why httpwut

You fire a request. Something's off. `curl -v` dumps a wall of text, Postman hides the timing, Insomnia needs a GUI. You just want to know **what actually happened on the wire** — DNS, TCP, TLS, TTFB, each phase measured, redirects walked, headers diffed, status explained in plain English (and, ok, a little "bruh").

httpwut is that. One binary. Zero config. Works in SSH sessions, CI logs, and Docker containers without pulling a thousand dependencies.

## Install

```bash
npm install -g @v0idd0/httpwut
```

Or run it ad-hoc with `npx`:

```bash
npx -y @v0idd0/httpwut https://api.github.com/users/octocat
```

## Quickstart

```bash
# Simple GET with full debug info
httpwut https://api.github.com/users/octocat

# POST with JSON body
httpwut https://api.example.com/orders -X POST -d '{"sku":"abc","qty":1}'

# Bearer token + query params
httpwut https://api.example.com/users --bearer "$TOKEN" --query limit=10 --query page=2

# Basic auth
httpwut https://api.example.com -u admin:hunter2

# Body from file (or '-' for stdin)
httpwut https://api.example.com/ingest -X POST --data-file @./payload.json
cat payload.json | httpwut https://api.example.com/ingest -X POST --data-file -

# Follow redirects and print the chain
httpwut https://voiddo.com -L

# Full phase-timing breakdown
httpwut https://api.example.com --timing

# Retry on transient 5xx
httpwut https://api.example.com --retry 3 --retry-delay 500 --retry-on-status 502,503,504

# Compare two endpoints
httpwut https://api.example.com/v1/users --compare https://api.example.com/v2/users

# Status-only mode (exit code maps to 2xx / non-2xx, no output chrome)
httpwut https://api.example.com --status-only

# Machine-readable JSON envelope for scripts
httpwut https://api.example.com --json | jq .status

# Print the equivalent curl command (no request is made)
httpwut https://api.example.com --bearer "$TOKEN" --curl
```

## Options

### Request
| Option | Description |
|--------|-------------|
| `-X, --method <method>` | HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS) |
| `-H, --header <header>` | Add header (can use multiple times) |
| `-d, --data <data>` | Request body (inline) |
| `--data-file <path>` | Read request body from file (use `-` for stdin) |
| `--query <k=v>` | Append a query param (can use multiple times) |
| `--bearer <token>` | Shortcut for `Authorization: Bearer <token>` |
| `-u, --user <user:pass>` | Basic auth shortcut |

### Output
| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Save response body to file |
| `--json` | Emit a single machine-readable JSON envelope |
| `--curl` | Print equivalent `curl` command (no request made) |
| `-v, --verbose` | Show everything (full headers, full body, timing) |
| `--headers-only` | Show only response headers |
| `--body-only` | Show only response body (raw, no chrome) |
| `--status-only` | Show only status code, exit 0 on 2xx / 1 otherwise |
| `--timing` | DNS / TCP / TLS / Wait / TTFB / Download breakdown |

### Behavior
| Option | Description |
|--------|-------------|
| `-e, --expect <codes>` | Expected status codes, comma-separated |
| `-L, --follow` | Follow redirects (prints the chain) |
| `--compare <url>` | Diff headers / body / timing against another endpoint |
| `--insecure` | Skip SSL verification |
| `--timeout <ms>` | Request timeout (default 30000) |
| `--retry <n>` | Retry on network errors up to N times |
| `--retry-delay <ms>` | Base delay between retries, linear backoff |
| `--retry-on-status <codes>` | Also retry on these status codes (e.g. `502,503,504`) |

## Features

### Phase-timing breakdown
httpwut measures each phase from the Node socket lifecycle — DNS lookup, TCP connect, TLS handshake, server wait, TTFB, and download — and prints them as stacked bars. No wrapping `curl --trace-ascii`, no guessing which phase is slow.

### Human-readable errors
Every `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, `SELF_SIGNED_CERT_IN_CHAIN` is translated. No more googling cryptic Node error codes.

### Status code cheat-sheet built in
Every 4xx and 5xx gets a one-liner in plain English. Includes modern codes most curl wrappers ignore: 418, 422, 425, 426, 429, 451, 511, 507, 508.

### Endpoint diff
`--compare <url>` fires two requests, diffs status + every header + body + timing. Great for A/B testing load balancers, canary deploys, and "is this proxy actually transparent?"

### Redirect chain walker
`--follow` hops up to 10 redirects and prints every step with status, URL, and color coding.

### JSON envelope
`--json` emits a single JSON object with `ok / url / status / headers / body / timing / redirectChain / statusHelp` — drop it straight into `jq`, GitHub Actions matrices, or `uptime` scripts.

### `curl` emitter
`--curl` prints the exact `curl` command that would produce the same request — method, headers, body, `-k`, all of it — without actually firing. Perfect for pasting into bug reports.

### Retries with backoff
`--retry 3 --retry-on-status 502,503,504` retries on network errors and configurable status codes with linear backoff. Reports `(after N attempts)` in the final status block so you know it wasn't a first-shot win.

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Response status is 2xx |
| `1`  | Response status is non-2xx OR the request itself failed |
| `2`  | Invalid flags (e.g. both `--data` and `--data-file`) |

## Programmatic use

```js
const { makeRequestWithRetries, getStatusHelp } = require('@v0idd0/httpwut/src/requester');

const res = await makeRequestWithRetries('https://api.example.com/ping', {
  method: 'GET',
  timeout: 5000,
  retries: 2,
  retryDelay: 300,
  retryOnStatus: [502, 503, 504],
});

console.log(res.status, getStatusHelp(res.status), res.timing);
```

Exports: `makeRequest`, `makeRequestWithRetries`, `followRedirects`, `parseHeaders`, `getErrorHelp`, `getStatusHelp`, `isSuccess`, `formatJson`, `truncate`, `compareResponses`, `toCurl`, `buildUrl`, `ERROR_HELP`, `STATUS_HELP`.

## From the same studio

vøiddo builds sharp, free-forever CLIs for devs who are tired of paywalls:

- [`@v0idd0/jsonyo`](https://voiddo.com/tools/jsonyo/) — JSON that yells at you when it's broken
- [`@v0idd0/tokcount`](https://voiddo.com/tools/tokcount/) — token counter for 60+ LLMs (GPT-5.4, Claude Opus 4.7, Gemini 3.1, Llama 4, Grok 4.1)
- [`@v0idd0/ctxstuff`](https://voiddo.com/tools/ctxstuff/) — stuff a repo into an LLM context window without the OOM
- [`@v0idd0/promptdiff`](https://voiddo.com/tools/promptdiff/) — diff two prompts, see token impact + word-frequency delta

Full catalog: [voiddo.com/tools](https://voiddo.com/tools/).

## License

MIT © [vøiddo](https://voiddo.com) — free forever, no asterisks.

## Links

- Docs: https://voiddo.com/tools/httpwut/
- Source: https://github.com/voidd0/httpwut
- npm: https://npmjs.com/package/@v0idd0/httpwut
- Studio: https://voiddo.com
- Issues: https://github.com/voidd0/httpwut/issues
- Support: support@voiddo.com
