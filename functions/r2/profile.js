// POST /r2/profile?slug=xxx (multipart/form-data, field: file)
// → profiles/{slug}.{ext} 고정 키로 덮어쓰기

const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const MAX_SIZE = 3 * 1024 * 1024; // 3MB
const BUCKET = 'soopnote-images';

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

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { CF_ACCOUNT_ID, CF_API_TOKEN, R2_PUBLIC_URL } = env;
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return json({ error: 'R2 not configured' }, 500);

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return json({ error: 'slug 필요' }, 400);

  let formData;
  try { formData = await request.formData(); } catch { return json({ error: '파일 파싱 실패' }, 400); }

  const file = formData.get('file');
  if (!file || typeof file === 'string') return json({ error: '파일 없음' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return json({ error: '지원하지 않는 형식' }, 400);

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_SIZE) return json({ error: '3MB 이하만 가능' }, 400);

  // slug 고정 키로 저장 (항상 덮어쓰기)
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `profiles/${slug}.${ext}`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${key}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': file.type },
      body: buf,
    }
  );

  if (!res.ok) return json({ error: 'R2 업로드 실패' }, 500);

  // cache bust용 쿼리스트링 추가
  const imageUrl = `${R2_PUBLIC_URL}/${key}?v=${Date.now()}`;
  return json({ url: imageUrl, key });
}
