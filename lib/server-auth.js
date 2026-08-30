import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'sitescope_session';

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  return (cookieHeader || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidSession(request) {
  const token = readCookie(request.headers?.cookie, COOKIE_NAME);
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;

  const [expiresAt, signature, extra] = token.split('.');
  if (!expiresAt || !signature || extra || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, createHmac('sha256', secret).update(expiresAt).digest('base64url'));
}

export function requireSession(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (hasValidSession(request)) return true;
  response.status(401).json({ error: 'Сессия истекла. Войдите в сервис ещё раз.' });
  return false;
}
