// POST /auth/admin { password } → { token }

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ADMIN_SECRET = env.ADMIN_SECRET;
  if (!ADMIN_SECRET) return json({ error: 'Not configured' }, 500);

  let password;
  try { ({ password } = await request.json()); } catch { return json({ error: '잘못된 요청' }, 400); }

  const pwHash = await sha256(password);
  const secretHash = await sha256(ADMIN_SECRET);

  if (pwHash !== secretHash) return json({ error: '비밀번호 오류' }, 401);

  // 세션 토큰 발급 (1시간 유효)
  const token = await sha256(`admin:${Date.now()}:${ADMIN_SECRET}`);
  const expires = Date.now() + 3600 * 1000;

  return json({ ok: true, token, expires });
}
