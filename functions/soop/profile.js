// GET /soop/profile?slug=jjuppi1022

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

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'slug 필요' }, 400);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const [dashRes, poongRes] = await Promise.allSettled([
      fetch(`https://api-channel.sooplive.com/v1.1/channel/${slug}/dashboard`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch(`https://static.poong.today/bj/detail/get?id=${slug}&year=${year}&month=${month}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
    ]);

    let dashboard = null;
    let poong = null;

    if (dashRes.status === 'fulfilled' && dashRes.value.ok) {
      dashboard = await dashRes.value.json();
    }
    if (poongRes.status === 'fulfilled' && poongRes.value.ok) {
      poong = await poongRes.value.json();
    }

    let broadcastHours = 0;
    let balloons = 0;
    if (poong && Array.isArray(poong.c)) {
      broadcastHours = poong.c.reduce((sum, item) => sum + (item.t || 0), 0) / 3600;
    }
    if (poong) balloons = poong.b || 0;

    const upd = dashboard?.upd || {};
    const station = dashboard?.station || {};
    const subscription = dashboard?.subscription || {};

    return json({
      slug,
      nick: station.userNick || '',
      profileImage: `https://profile.img.sooplive.com/LOGO/${slug.substring(0, 2)}/${slug}/${slug}.jpg`,
      fanCount: upd.fanCnt || 0,
      fanclubCount: upd.fanclubCnt || 0,
      subscribers: Number(subscription.total) || 0,
      totalVisit: upd.totalVisitCnt || 0,
      broadcastHours: Math.round(broadcastHours * 10) / 10,
      balloons,
      lastBroadcast: station.broadStart || null,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
