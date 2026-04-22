// httpwut — free forever from vøiddo. https://voiddo.com/tools/httpwut/
// HTTP request debugger core: makes requests, collects phase timings, maps errors to human hints.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const ERROR_HELP = {
  ECONNREFUSED: 'bruh. nothing is listening on that port. is your server running?',
  ENOTFOUND: 'bruh. DNS lookup failed. check the hostname.',
  ETIMEDOUT: 'bruh. request timed out. server too slow or blocked.',
  ECONNRESET: 'bruh. connection was reset. server closed it unexpectedly.',
  EPIPE: 'bruh. pipe broke mid-write. server hung up while we were sending.',
  EHOSTUNREACH: 'bruh. host unreachable. routing or firewall problem.',
  ENETUNREACH: 'bruh. network unreachable. your machine has no route to them.',
  EADDRINUSE: 'bruh. address already in use. another process is on that port.',
  EADDRNOTAVAIL: 'bruh. that local address is not available on this host.',
  EAI_AGAIN: 'bruh. DNS temporarily unavailable. try again in a sec.',
  EAI_NODATA: 'bruh. DNS resolved but has no records for that hostname.',
  EPROTO: 'bruh. protocol error during TLS handshake. probably a version/cipher mismatch.',
  CERT_HAS_EXPIRED: 'bruh. SSL certificate expired. tell them to renew it.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'bruh. SSL cert not trusted. self-signed?',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'bruh. self-signed certificate. use --insecure if you trust it.',
  SELF_SIGNED_CERT_IN_CHAIN: 'bruh. self-signed cert somewhere in the chain. use --insecure if you trust it.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'bruh. certificate hostname mismatch. cert was issued for a different domain.',
  UNABLE_TO_GET_ISSUER_CERT: 'bruh. intermediate CA missing. the server did not send the full chain.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'bruh. CA not in your trust store. update ca-certificates or use --insecure.',
  CERT_UNTRUSTED: 'bruh. certificate chain not trusted.',
  ERR_SSL_WRONG_VERSION_NUMBER: 'bruh. probably hit an http:// server with https://. check the scheme.',
  ERR_INVALID_URL: 'bruh. that URL is malformed.',
  ERR_SOCKET_CONNECTION_TIMEOUT: 'bruh. socket connection timed out before it opened.',
};

const STATUS_HELP = {
  400: 'bruh. bad request. check your payload/params.',
  401: 'bruh. unauthorized. missing or bad auth credentials.',
  402: 'bruh. payment required. rare in the wild; usually a paywalled API.',
  403: 'bruh. forbidden. you dont have permission.',
  404: 'bruh. not found. that endpoint doesnt exist.',
  405: 'bruh. method not allowed. wrong HTTP method.',
  406: 'bruh. not acceptable. your Accept header rules out every representation they have.',
  408: 'bruh. request timeout. server gave up waiting.',
  409: 'bruh. conflict. resource state is not what you assumed.',
  410: 'bruh. gone. that resource was intentionally removed.',
  411: 'bruh. length required. send a Content-Length header.',
  412: 'bruh. precondition failed. If-Match / If-None-Match rejected you.',
  413: 'bruh. payload too large. shrink the body or split the upload.',
  414: 'bruh. URI too long. move those params into a POST body.',
  415: 'bruh. unsupported media type. set Content-Type to something they accept.',
  416: 'bruh. range not satisfiable. your Range header is out of bounds.',
  417: 'bruh. expectation failed. their Expect: 100-continue dance rejected you.',
  418: 'bruh. I\'m a teapot. someone is having fun on this endpoint.',
  421: 'bruh. misdirected request. you hit a server that cant serve this authority.',
  422: 'bruh. unprocessable entity. payload shape is fine but semantically wrong.',
  423: 'bruh. locked. resource is busy.',
  424: 'bruh. failed dependency. a prior request in your chain tanked.',
  425: 'bruh. too early. server refuses to replay this request.',
  426: 'bruh. upgrade required. switch protocols (usually to TLS or HTTP/2).',
  428: 'bruh. precondition required. they want an If-Match header and you didnt send one.',
  429: 'bruh. too many requests. you got rate limited.',
  431: 'bruh. request header fields too large. prune your headers.',
  451: 'bruh. unavailable for legal reasons. geo or takedown block.',
  500: 'bruh. server error. their problem not yours.',
  501: 'bruh. not implemented. server doesnt know this method.',
  502: 'bruh. bad gateway. proxy/load balancer issue.',
  503: 'bruh. service unavailable. server is overloaded or down.',
  504: 'bruh. gateway timeout. upstream server too slow.',
  505: 'bruh. HTTP version not supported.',
  507: 'bruh. insufficient storage. their disk is full.',
  508: 'bruh. loop detected. WebDAV request walked in circles.',
  510: 'bruh. not extended. server wants further extensions.',
  511: 'bruh. network authentication required. captive portal in the way.',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeRequest(url, options = {}) {
  const startTime = Date.now();
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error('Invalid URL: ' + url);
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const requestOptions = {
    method: options.method || 'GET',
    headers: options.headers || {},
    timeout: options.timeout || 30000,
    rejectUnauthorized: options.insecure ? false : true,
  };

  const phases = {
    dnsEnd: null,
    connectEnd: null,
    tlsEnd: null,
    firstByte: null,
    end: null,
  };

  return new Promise((resolve, reject) => {
    const req = client.request(parsedUrl, requestOptions, (res) => {
      let body = '';
      phases.firstByte = Date.now();
      const ttfb = phases.firstByte - startTime;

      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        phases.end = Date.now();
        const total = phases.end - startTime;
        const dns = phases.dnsEnd ? phases.dnsEnd - startTime : null;
        const tcp = phases.connectEnd && phases.dnsEnd
          ? phases.connectEnd - phases.dnsEnd
          : null;
        const tls = phases.tlsEnd && phases.connectEnd
          ? phases.tlsEnd - phases.connectEnd
          : null;
        const wait = phases.firstByte
          - (phases.tlsEnd || phases.connectEnd || phases.dnsEnd || startTime);

        resolve({
          url,
          method: requestOptions.method,
          status: res.statusCode,
          statusText: res.statusMessage,
          httpVersion: res.httpVersion,
          headers: res.headers,
          body,
          timing: {
            dns,
            tcp,
            tls,
            wait,
            ttfb,
            download: total - ttfb,
            total,
          },
          redirectUrl: res.headers.location || null,
        });
      });
    });

    req.on('socket', (socket) => {
      socket.once('lookup', () => {
        phases.dnsEnd = Date.now();
      });
      socket.once('connect', () => {
        phases.connectEnd = Date.now();
      });
      if (isHttps) {
        socket.once('secureConnect', () => {
          phases.tlsEnd = Date.now();
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      const err = new Error('ETIMEDOUT');
      err.code = 'ETIMEDOUT';
      reject(err);
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function makeRequestWithRetries(url, options = {}) {
  const maxAttempts = Math.max(1, options.retries ? options.retries + 1 : 1);
  const delay = options.retryDelay || 500;
  let lastErr;
  let lastRes;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await makeRequest(url, options);
      const retryOnStatus = options.retryOnStatus || [];
      if (attempt < maxAttempts && retryOnStatus.includes(res.status)) {
        lastRes = res;
        await sleep(delay * attempt);
        continue;
      }
      if (attempt > 1) res.attempts = attempt;
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(delay * attempt);
        continue;
      }
    }
  }
  if (lastErr) throw lastErr;
  return lastRes;
}

async function followRedirects(url, options = {}, maxRedirects = 10) {
  const chain = [];
  let currentUrl = url;
  let count = 0;

  while (count < maxRedirects) {
    const response = await makeRequest(currentUrl, options);
    chain.push({
      url: currentUrl,
      status: response.status,
      statusText: response.statusText,
    });

    if (response.status >= 300 && response.status < 400 && response.redirectUrl) {
      let nextUrl = response.redirectUrl;
      if (!nextUrl.startsWith('http')) {
        const base = new URL(currentUrl);
        nextUrl = new URL(nextUrl, base).toString();
      }
      currentUrl = nextUrl;
      count++;
    } else {
      response.redirectChain = chain;
      return response;
    }
  }

  throw new Error('Too many redirects (max: ' + maxRedirects + ')');
}

function parseHeaders(headerStrings) {
  const headers = {};
  for (const h of headerStrings) {
    const idx = h.indexOf(':');
    if (idx > 0) {
      const key = h.slice(0, idx).trim();
      const value = h.slice(idx + 1).trim();
      headers[key] = value;
    }
  }
  return headers;
}

function getErrorHelp(error) {
  const code = error.code || error.message;
  return ERROR_HELP[code] || 'bruh. something went wrong: ' + (error.message || code);
}

function getStatusHelp(status) {
  return STATUS_HELP[status] || null;
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

function formatJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function truncate(str, maxLen = 2000) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '\n... (truncated, ' + str.length + ' chars total)';
}

function compareResponses(resp1, resp2) {
  const diff = {
    status: resp1.status !== resp2.status,
    headers: {},
    bodyMatch: resp1.body === resp2.body,
    timing: {
      diff: resp2.timing.total - resp1.timing.total,
    },
  };

  const allHeaders = new Set([...Object.keys(resp1.headers), ...Object.keys(resp2.headers)]);
  for (const key of allHeaders) {
    if (resp1.headers[key] !== resp2.headers[key]) {
      diff.headers[key] = {
        first: resp1.headers[key] || '(missing)',
        second: resp2.headers[key] || '(missing)',
      };
    }
  }

  return diff;
}

function toCurl(url, options = {}) {
  const parts = ['curl'];
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') parts.push('-X', method);
  const headers = options.headers || {};
  for (const [k, v] of Object.entries(headers)) {
    parts.push('-H', JSON.stringify(k + ': ' + v));
  }
  if (options.body) {
    parts.push('--data', JSON.stringify(options.body));
  }
  if (options.insecure) parts.push('-k');
  parts.push(JSON.stringify(url));
  return parts.join(' ');
}

function buildUrl(baseUrl, queryParams = {}) {
  if (!Object.keys(queryParams).length) return baseUrl;
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(queryParams)) {
    u.searchParams.append(k, v);
  }
  return u.toString();
}

module.exports = {
  makeRequest,
  makeRequestWithRetries,
  followRedirects,
  parseHeaders,
  getErrorHelp,
  getStatusHelp,
  isSuccess,
  formatJson,
  truncate,
  compareResponses,
  toCurl,
  buildUrl,
  ERROR_HELP,
  STATUS_HELP,
};
