// POST /auth/recap
// body: { shareUrl: "https://dontaskname.github.io/soop-recap-share/share.html#v2.g...." }
// return: { ok: true, streamers: [{name, slug, seconds}], totalSec, month }

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

// base36 디코딩
function fromBase36(str) {
  return parseInt(String(str || '0'), 36) || 0;
}

// base64url → Uint8Array
function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  const padded = b64 + '='.repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// gzip 압축 해제
async function gunzip(bytes) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const out = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...value);
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

// share URL 해시 파싱
// 포맷: v2.g.{base64url-gzip-json} 또는 v2.j.{base64url-json}
async function parseShareHash(hash) {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;

  if (!clean.startsWith('v2.')) throw new Error('지원하지 않는 형식');

  const parts = clean.split('.');
  if (parts.length < 3) throw new Error('잘못된 형식');

  const encoding = parts[1]; // 'g' or 'j'
  const payload = parts.slice(2).join('.');

  const bytes = base64urlDecode(payload);
  let jsonStr;

  if (encoding === 'g') {
    jsonStr = await gunzip(bytes);
  } else if (encoding === 'j') {
    jsonStr = new TextDecoder().decode(bytes);
  } else {
    throw new Error('알 수 없는 인코딩');
  }

  return JSON.parse(jsonStr);
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let shareUrl;
  try {
    const body = await request.json();
    shareUrl = body.shareUrl;
  } catch {
    return json({ error: '잘못된 요청' }, 400);
  }

  if (!shareUrl) return json({ error: 'shareUrl 필요' }, 400);

  // URL에서 hash 추출
  let hash;
  try {
    const url = new URL(shareUrl);
    hash = url.hash;
  } catch {
    return json({ error: '잘못된 URL' }, 400);
  }

  if (!hash) return json({ error: 'share URL에 데이터가 없습니다' }, 400);

  let data;
  try {
    data = await parseShareHash(hash);
  } catch (e) {
    return json({ error: '파싱 실패: ' + e.message }, 400);
  }

  // 데이터 구조: [version, yearMonth, type, timestamp, msg, totalWatchBase36, attendanceDays, [[name, secBase36, slug], ...]]
  if (!Array.isArray(data) || data.length < 8) {
    return json({ error: '데이터 구조 오류' }, 400);
  }

  const [version, yearMonth, type, , , totalWatchBase36, , streamerRaw] = data;

  const totalSec = fromBase36(totalWatchBase36);

  // 연월 파싱 (예: "2605" → 2026-05)
  const ym = String(yearMonth);
  const month = ym.length === 4
    ? `20${ym.slice(0, 2)}-${ym.slice(2, 4)}`
    : ym;

  // 스트리머 목록 파싱 + 2시간(7200초) 이상만 필터
  const streamers = (Array.isArray(streamerRaw) ? streamerRaw : [])
    .map(s => ({
      name: s[0] || '',
      seconds: fromBase36(s[1]),
      slug: s[2] || '',
    }))
    .filter(s => s.name && s.name !== '기타' && s.seconds >= 7200);

  if (streamers.length === 0) {
    return json({ error: '2시간 이상 시청한 스트리머가 없습니다' }, 400);
  }

  return json({
    ok: true,
    month,
    totalSec,
    streamers,
  });
}
