const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';

// 캐시 없음 - 항상 최신 데이터
const CACHE_TTL = {};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Prefer',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  const ANON_KEY = env.SUPABASE_ANON_KEY;

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (!SERVICE_KEY) return json({ error: 'Not configured' }, 500);

  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const table = path.split('?')[0].split('/')[0];
  const isWrite = ['POST', 'PATCH', 'DELETE'].includes(request.method);

  // 항상 service key 사용 (RLS 우회 + join 쿼리 지원)
  const apiKey = SERVICE_KEY;

  const target = `${SUPABASE_URL}/rest/v1/${path}${url.search}`;
  const prefer = request.headers.get('Prefer') || '';

  const resp = await fetch(target, {
    method: request.method,
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { 'Prefer': prefer } : {}),
    },
    body: isWrite ? request.body : null,
  });

  const body = await resp.text();
  const ttl = CACHE_TTL[table] || 30;

  return new Response(body, {
    status: resp.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...corsHeaders(),
    },
  });
}
