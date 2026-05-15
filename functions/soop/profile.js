// GET /soop/profile?slug=jjuppi1022
// SOOP dashboard + 풍투데이 6개월 히스토리 반환

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      ...corsHeaders(),
    },
  });
}

function getMonths(n = 6) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'slug 필요' }, 400);

  try {
    // SOOP dashboard API
    const dashRes = await fetch(
      `https://api-channel.sooplive.com/v1.1/channel/${slug}/dashboard`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    );

    if (!dashRes.ok) return json({ error: 'SOOP API 오류' }, 502);
    const dash = await dashRes.json();

    const station = dash.station || {};
    const upd = dash.upd || {};
    const subscription = dash.subscription || {};

    // 누적 방송시간 (초 → 시간)
    const totalBroadHours = station.totalBroadTime
      ? Math.round(station.totalBroadTime / 3600)
      : 0;

    // 풍투데이 6개월 히스토리
    const months = getMonths(6);
    const balloonHistory = {};
    const broadcastHistory = {};

    await Promise.all(months.map(async ({ year, month }) => {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      try {
        const res = await fetch(
          `https://static.poong.today/bj/detail/get?id=${slug}&year=${year}&month=${month}`,
          { headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://www.poong.today/',
          'Origin': 'https://www.poong.today',
          'Accept': 'application/json, text/plain, */*',
        }}
        );
        if (!res.ok) return;
        const data = await res.json();
        balloonHistory[ym] = data.b ?? 0;
        const sec = (data.c || []).reduce((s, c) => s + (c.t || 0), 0);
        broadcastHistory[ym] = Math.round(sec / 3600 * 10) / 10;
      } catch {}
    }));

    return json({
      slug,
      nick: station.userNick || '',
      profileImage: `https://profile.img.sooplive.com/LOGO/${slug.substring(0, 2)}/${slug}/${slug}.jpg`,
      fanCount: upd.fanCnt || 0,
      fanclubCount: dash.fanclubCnt || 0,
      supporters: dash.supporterCnt || 0,
      subscribers: parseInt(subscription.total) || 0,
      totalVisit: upd.totalVisitCnt || 0,
      totalBroadHours,
      lastBroadcast: station.broadStart || null,
      firstBroadDate: station.firstBroadDate || null,
      balloonHistory,
      broadcastHistory,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
