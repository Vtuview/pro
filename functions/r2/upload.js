// POST /r2/upload (multipart/form-data)
// field: file (이미지, 최대 2MB, webp/jpg/png/gif)
// return: { url }

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const CF_ACCOUNT_ID = env.CF_ACCOUNT_ID;
  const CF_API_TOKEN = env.CF_API_TOKEN;
  const R2_PUBLIC_URL = env.R2_PUBLIC_URL;
  const BUCKET = 'soopnote-images';

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return json({ error: 'R2 not configured' }, 500);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: '파일 파싱 실패' }, 400);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') return json({ error: '파일 없음' }, 400);

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: '지원하지 않는 파일 형식 (jpg/png/gif/webp만 가능)' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_SIZE) {
    return json({ error: '파일 크기는 2MB 이하여야 합니다' }, 400);
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const key = `notes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const uploadRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${key}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': file.type,
      },
      body: arrayBuffer,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return json({ error: 'R2 업로드 실패: ' + err }, 500);
  }

  return json({ url: `${R2_PUBLIC_URL}/${key}` });
}
