const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';

const CACHE_TTL = {
  soop_streamers: 60,
  soop_notes: 30,
};

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

  // 쓰기는 service key, 읽기는 anon key
  const apiKey = isWrite ? SERVICE_KEY : (ANON_KEY || SERVICE_KEY);

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
      ...(request.method === 'GET' ? { 'Cache-Control': `public, max-age=${ttl}` } : {}),
      ...corsHeaders(),
    },
  });
}
