import { next } from '@vercel/functions';

const COOKIE_NAME = 'sitescope_session';
const encoder = new TextEncoder();

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  return (cookieHeader || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hasValidSession(token, secret) {
  if (!token || !secret) return false;
  const [expiresAt, signature, extra] = token.split('.');
  if (!expiresAt || !signature || extra || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), encoder.encode(expiresAt));
  } catch {
    return false;
  }
}

export default async function middleware(request) {
  const token = readCookie(request.headers.get('cookie'), COOKIE_NAME);
  if (await hasValidSession(token, process.env.AUTH_SECRET)) return next();

  const requestUrl = new URL(request.url);
  const loginUrl = new URL('/login.html', request.url);
  loginUrl.searchParams.set('next', `${requestUrl.pathname}${requestUrl.search}`);
  return Response.redirect(loginUrl, 307);
}

export const config = {
  matcher: ['/', '/index', '/index.html', '/analyzer', '/analyzer.html', '/workflow', '/workflow.html', '/about', '/about.html'],
};
