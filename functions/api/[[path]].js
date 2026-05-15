// GET /api/* → Supabase REST 프록시

const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';

const CACHE_TTL = {
  soop_streamers: 300,
  soop_notes: 60,
};
const DEFAULT_TTL = 60;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Prefer, x-fingerprint',
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
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (!SUPABASE_ANON_KEY) return json({ error: 'Not configured' }, 500);

  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  const table = path.split('?')[0].split('/')[0];

  const isWrite = ['POST', 'PATCH', 'DELETE'].includes(request.method);
  const apiKey = isWrite ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;

  const supabaseTarget = `${SUPABASE_URL}/rest/v1/${path}${url.search}`;

  const headers = {
    'apikey': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Prefer': request.headers.get('Prefer') || '',
  };

  const resp = await fetch(supabaseTarget, {
    method: request.method,
    headers,
    body: isWrite ? request.body : null,
  });

  const body = await resp.text();
  const ttl = CACHE_TTL[table] || DEFAULT_TTL;

  return new Response(body, {
    status: resp.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(request.method === 'GET' ? {
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      } : {}),
      ...corsHeaders(),
    },
  });
}
