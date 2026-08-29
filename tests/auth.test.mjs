import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import login from '../api/login.js';
import logout from '../api/logout.js';
import middleware from '../middleware.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
    },
    end() {
      return this;
    },
  };
}

test('login rejects an incorrect password', async () => {
  process.env.SITE_PASSWORD = 'correct-password';
  process.env.AUTH_SECRET = 'test-auth-secret';
  delete process.env.VERCEL;

  const response = createResponse();
  await login({ method: 'POST', body: { password: 'wrong-password' } }, response);

  assert.equal(response.statusCode, 401);
  assert.equal(response.headers.has('set-cookie'), false);
});

test('login creates a signed HttpOnly session', async () => {
  process.env.SITE_PASSWORD = 'correct-password';
  process.env.AUTH_SECRET = 'test-auth-secret';
  delete process.env.VERCEL;

  const response = createResponse();
  await login({ method: 'POST', body: { password: 'correct-password' } }, response);

  const cookie = response.headers.get('set-cookie');
  assert.equal(response.statusCode, 200);
  assert.match(cookie, /^sitescope_session=\d+\.[\w-]+;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('middleware redirects a visitor without a session', async () => {
  process.env.AUTH_SECRET = 'test-auth-secret';
  const response = await middleware(new Request('https://example.com/analyzer.html'));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://example.com/login.html?next=%2Fanalyzer.html');
});

test('middleware accepts a correctly signed session', async () => {
  process.env.AUTH_SECRET = 'test-auth-secret';
  const expiresAt = String(Math.floor(Date.now() / 1000) + 300);
  const signature = createHmac('sha256', process.env.AUTH_SECRET).update(expiresAt).digest('base64url');
  const request = new Request('https://example.com/', {
    headers: { cookie: `sitescope_session=${expiresAt}.${signature}` },
  });
  const response = await middleware(request);

  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('logout clears the session and returns to the login page', () => {
  delete process.env.VERCEL;
  const response = createResponse();
  logout({ method: 'POST' }, response);

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.get('location'), '/login.html');
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
