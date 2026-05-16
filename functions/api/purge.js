// POST /api/purge?table=soop_streamers
// 쓰기 후 CF 캐시 즉시 무효화

const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';
const ALLOWED = ['soop_streamers', 'soop_notes', 'soop_streamer_tokens'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });

  const url = new URL(request.url);
  const table = url.searchParams.get('table');

  if (!table || !ALLOWED.includes(table)) {
    return new Response(JSON.stringify({ error: 'invalid table' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const cache = caches.default;

  // 해당 테이블의 캐시 키 패턴 삭제
  const keys = [
    `${SUPABASE_URL}/rest/v1/${table}?select=*`,
    `${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc`,
    `${SUPABASE_URL}/rest/v1/${table}?is_active=eq.true&select=id,slug,name,profile_image&order=created_at.desc`,
    `${SUPABASE_URL}/rest/v1/${table}?select=streamer_id,rating_avatar,rating_song,rating_talk,rating_attend,created_at`,
  ];

  let purged = 0;
  for (const key of keys) {
    if (await cache.delete(new Request(key))) purged++;
  }

  return new Response(JSON.stringify({ ok: true, purged }), {
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}
