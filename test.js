// httpwut — tests. free forever from vøiddo. https://voiddo.com/tools/httpwut/

const requester = require('./src/requester');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('\x1b[32m✓ ' + name + '\x1b[0m');
    passed++;
  } catch (e) {
    console.log('\x1b[31m✗ ' + name + '\x1b[0m');
    console.log('  ' + e.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log('\x1b[32m✓ ' + name + '\x1b[0m');
    passed++;
  } catch (e) {
    console.log('\x1b[31m✗ ' + name + '\x1b[0m');
    console.log('  ' + e.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Test parseHeaders
test('parseHeaders handles single header', () => {
  const headers = requester.parseHeaders(['Content-Type: application/json']);
  assert(headers['Content-Type'] === 'application/json', 'Should parse header correctly');
});

test('parseHeaders handles multiple headers', () => {
  const headers = requester.parseHeaders([
    'Content-Type: application/json',
    'Authorization: Bearer token123',
    'X-Custom: value'
  ]);
  assert(Object.keys(headers).length === 3, 'Should have 3 headers');
  assert(headers['Authorization'] === 'Bearer token123', 'Should parse auth header');
});

test('parseHeaders handles header with colons in value', () => {
  const headers = requester.parseHeaders(['X-Time: 12:30:45']);
  assert(headers['X-Time'] === '12:30:45', 'Should preserve colons in value');
});

// Test isSuccess
test('isSuccess returns true for 2xx', () => {
  assert(requester.isSuccess(200) === true, '200 should be success');
  assert(requester.isSuccess(201) === true, '201 should be success');
  assert(requester.isSuccess(204) === true, '204 should be success');
});

test('isSuccess returns false for non-2xx', () => {
  assert(requester.isSuccess(400) === false, '400 should not be success');
  assert(requester.isSuccess(404) === false, '404 should not be success');
  assert(requester.isSuccess(500) === false, '500 should not be success');
});

// Test getStatusHelp
test('getStatusHelp returns message for known codes', () => {
  const help = requester.getStatusHelp(404);
  assert(help !== null, 'Should have help for 404');
  assert(help.includes('not found'), 'Should mention not found');
});

test('getStatusHelp returns null for unknown codes', () => {
  const help = requester.getStatusHelp(200);
  assert(help === null, 'Should return null for 200');
});

// Test getErrorHelp
test('getErrorHelp returns message for known errors', () => {
  const help = requester.getErrorHelp({ code: 'ECONNREFUSED' });
  assert(help.includes('nothing is listening'), 'Should have connection refused help');
});

test('getErrorHelp returns generic message for unknown errors', () => {
  const help = requester.getErrorHelp({ message: 'Some error' });
  assert(help.includes('Some error'), 'Should include error message');
});

// Test formatJson
test('formatJson formats valid JSON', () => {
  const result = requester.formatJson('{"name":"test"}');
  assert(result.includes('\n'), 'Should have newlines');
  assert(result.includes('  '), 'Should have indentation');
});

test('formatJson returns original for invalid JSON', () => {
  const result = requester.formatJson('not json');
  assert(result === 'not json', 'Should return original');
});

// Test truncate
test('truncate shortens long strings', () => {
  const long = 'a'.repeat(5000);
  const result = requester.truncate(long, 100);
  assert(result.length < 200, 'Should be truncated');
  assert(result.includes('truncated'), 'Should indicate truncation');
});

test('truncate leaves short strings alone', () => {
  const short = 'hello';
  const result = requester.truncate(short, 100);
  assert(result === short, 'Should not modify short string');
});

// Test compareResponses
test('compareResponses detects status difference', () => {
  const resp1 = { status: 200, headers: {}, body: 'test', timing: { total: 100 } };
  const resp2 = { status: 404, headers: {}, body: 'test', timing: { total: 150 } };
  const diff = requester.compareResponses(resp1, resp2);
  assert(diff.status === true, 'Should detect status diff');
});

test('compareResponses detects body difference', () => {
  const resp1 = { status: 200, headers: {}, body: 'hello', timing: { total: 100 } };
  const resp2 = { status: 200, headers: {}, body: 'world', timing: { total: 100 } };
  const diff = requester.compareResponses(resp1, resp2);
  assert(diff.bodyMatch === false, 'Should detect body diff');
});

test('compareResponses detects header difference', () => {
  const resp1 = { status: 200, headers: { 'content-type': 'text/html' }, body: '', timing: { total: 100 } };
  const resp2 = { status: 200, headers: { 'content-type': 'application/json' }, body: '', timing: { total: 100 } };
  const diff = requester.compareResponses(resp1, resp2);
  assert(Object.keys(diff.headers).length > 0, 'Should detect header diff');
});

test('compareResponses calculates timing diff', () => {
  const resp1 = { status: 200, headers: {}, body: '', timing: { total: 100 } };
  const resp2 = { status: 200, headers: {}, body: '', timing: { total: 150 } };
  const diff = requester.compareResponses(resp1, resp2);
  assert(diff.timing.diff === 50, 'Should calculate timing diff');
});

// Test ERROR_HELP and STATUS_HELP exist
test('ERROR_HELP has common errors', () => {
  assert(requester.ERROR_HELP['ECONNREFUSED'], 'Should have ECONNREFUSED');
  assert(requester.ERROR_HELP['ENOTFOUND'], 'Should have ENOTFOUND');
  assert(requester.ERROR_HELP['ETIMEDOUT'], 'Should have ETIMEDOUT');
});

test('STATUS_HELP has common status codes', () => {
  assert(requester.STATUS_HELP[400], 'Should have 400');
  assert(requester.STATUS_HELP[401], 'Should have 401');
  assert(requester.STATUS_HELP[404], 'Should have 404');
  assert(requester.STATUS_HELP[500], 'Should have 500');
});

async function runAsyncTests() {
  // Test makeRequest with real endpoint (skip if network unavailable)
  await asyncTest('makeRequest returns response object', async () => {
    try {
      const resp = await requester.makeRequest('https://example.com');
      assert(resp.status !== undefined, 'Should have status');
      assert(resp.headers !== undefined, 'Should have headers');
      assert(resp.body !== undefined, 'Should have body');
      assert(resp.timing !== undefined, 'Should have timing');
    } catch (e) {
      // Network may be unavailable, skip
      if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.message.includes('socket')) {
        console.log('    (skipped - network unavailable)');
        return;
      }
      throw e;
    }
  });

  await asyncTest('makeRequest handles connection error gracefully', async () => {
    try {
      await requester.makeRequest('https://localhost:59999');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.code === 'ECONNREFUSED' || e.message.includes('ECONNREFUSED'), 'Should get connection refused');
    }
  });

  await asyncTest('makeRequest handles invalid URL', async () => {
    try {
      await requester.makeRequest('not-a-url');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e.message.includes('Invalid URL'), 'Should throw invalid URL error');
    }
  });

  console.log('\n' + passed + '/' + (passed + failed) + ' tests passed\n');
  if (failed > 0) process.exit(1);
}

runAsyncTests();
