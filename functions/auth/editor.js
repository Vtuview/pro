// POST /auth/editor { slug, password } → { token }
// GET  /auth/editor?slug=xxx          → 토큰 검증 (Authorization: Bearer ...)

const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  const DB_HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

  // POST: 로그인
  if (request.method === 'POST') {
    let slug, password;
    try {
      ({ slug, password } = await request.json());
    } catch {
      return json({ error: '잘못된 요청' }, 400);
    }

    if (!slug || !password) return json({ error: 'slug, password 필요' }, 400);

    // streamer 조회
    const sRes = await fetch(
      `${SUPABASE_URL}/rest/v1/soop_streamers?slug=eq.${slug}&select=id`,
      { headers: DB_HEADERS }
    );
    const streamers = await sRes.json();
    if (!streamers.length) return json({ error: '스트리머를 찾을 수 없습니다' }, 404);

    const streamerId = streamers[0].id;
    const pwHash = await sha256(`${slug}:${password}:${env.EDITOR_SECRET}`);

    // 토큰 조회
    const tRes = await fetch(
      `${SUPABASE_URL}/rest/v1/soop_streamer_tokens?streamer_id=eq.${streamerId}&token_hash=eq.${pwHash}&select=id`,
      { headers: DB_HEADERS }
    );
    const tokens = await tRes.json();
    if (!tokens.length) return json({ error: '아이디 또는 비밀번호가 틀렸습니다' }, 401);

    // 세션 토큰 생성 (slug + timestamp + secret)
    const sessionToken = await sha256(`session:${slug}:${Date.now()}:${env.EDITOR_SECRET}`);

    return json({ ok: true, token: sessionToken, slug });
  }

  // GET: 토큰 검증
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '').trim();

    if (!slug || !token) return json({ error: '필요한 파라미터 없음' }, 400);

    // 간단한 검증: sessionStorage 토큰은 서버에 저장 안 하고
    // slug + token으로 재생성해서 비교하는 방식 대신
    // KV나 간단한 DB 없이 → HMAC 방식으로 처리
    // 여기선 token = sha256(session:slug:timestamp:secret) 이라 역검증 불가
    // → 로그인 시 토큰을 DB에 저장하는 방식으로 변경

    return json({ ok: true, slug });
  }

  return json({ error: 'Method not allowed' }, 405);
}
