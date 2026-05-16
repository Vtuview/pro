// POST /auth/editor/issue { slug, password, adminToken }

const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...cors() },
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

  const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  const EDITOR_SECRET = env.EDITOR_SECRET;
  if (!SERVICE_KEY || !EDITOR_SECRET) return json({ error: 'Not configured' }, 500);

  let slug, password, adminToken;
  try { ({ slug, password, adminToken } = await request.json()); } catch { return json({ error: '잘못된 요청' }, 400); }
  if (!adminToken) return json({ error: '권한 없음' }, 401);

  const DB = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const sRes = await fetch(`${SUPABASE_URL}/rest/v1/soop_streamers?slug=eq.${slug}&select=id`, { headers: DB });
  const streamers = await sRes.json();
  if (!streamers.length) return json({ error: '스트리머를 찾을 수 없습니다' }, 404);
  const streamerId = streamers[0].id;

  const tokenHash = await sha256(`${slug}:${password}:${EDITOR_SECRET}`);

  // 기존 토큰 삭제
  await fetch(`${SUPABASE_URL}/rest/v1/soop_streamer_tokens?streamer_id=eq.${streamerId}`, {
    method: 'DELETE', headers: DB,
  });

  // 새 토큰 발급
  const tRes = await fetch(`${SUPABASE_URL}/rest/v1/soop_streamer_tokens`, {
    method: 'POST',
    headers: { ...DB, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ streamer_id: streamerId, token_hash: tokenHash }),
  });

  if (!tRes.ok) return json({ error: '발급 실패' }, 500);
  return json({ ok: true });
}
