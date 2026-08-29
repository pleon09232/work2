import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'sitescope_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Используйте форму входа.' });
  }

  const configuredPassword = process.env.SITE_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!configuredPassword || !authSecret) {
    return response.status(503).json({ error: 'Авторизация ещё не настроена на сервере.' });
  }

  const submittedPassword = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!safeEqual(submittedPassword, configuredPassword)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return response.status(401).json({ error: 'Неверный пароль. Попробуйте ещё раз.' });
  }

  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const token = `${expiresAt}.${sign(expiresAt, authSecret)}`;
  const secure = process.env.VERCEL ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`);
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ ok: true });
}
