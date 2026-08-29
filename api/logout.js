const COOKIE_NAME = 'sitescope_session';

export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const secure = process.env.VERCEL ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  response.setHeader('Cache-Control', 'no-store');
  response.writeHead(303, { Location: '/login.html' });
  return response.end();
}
