const SOOP_TOKEN_URL = 'https://openapi.sooplive.com/auth/token';
const SOOP_USERINFO_URL = 'https://openapi.sooplive.com/user/stationinfo';
const CLIENT_ID = 'a34f99ffbc82fcaabf6f8684bfdad71a';
const REDIRECT_URI = 'https://soopnote.pages.dev/auth/callback';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  const CLIENT_SECRET = env.SOOP_CLIENT_SECRET;
  const SESSION_SECRET = env.SESSION_SECRET || 'fallback';

  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return Response.redirect('/?soop_error=no_code', 302);
  }

  try {
    // 1. code → access_token
    const tokenRes = await fetch(SOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }).toString(),
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch { tokenData = {}; }

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || tokenText;
      return Response.redirect(`/?soop_error=token&msg=${encodeURIComponent(errMsg)}`, 302);
    }

    const accessToken = tokenData.access_token;

    // 2. access_token → 유저 정보
    const userRes = await fetch(SOOP_USERINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken }).toString(),
    });

    const userText = await userRes.text();
    let userData = {};
    try { userData = JSON.parse(userText); } catch {}

    const d = userData.data || {};
    const userId = d.user_id || d.userId || '';
    const userNick = d.user_nick || d.userNick || '';
    const profileImage = d.profile_image || '';
    const favoriteCount = d.favorite_cnt || 0;

    // 3. broadstatistic 시청시간 시도
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${y}-${mo}-01`;
    const lastDay = `${y}-${mo}-${new Date(y, now.getMonth()+1, 0).getDate()}`;

    let watchSeconds = 0;
    let watchStreamers = [];
    let bsMethod = 'not_tried';

    if (userId) {
      try {
        // Bearer 방식 시도
        const bsRes = await fetch('https://broadstatistic.sooplive.com/api/watch_statistic.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: new URLSearchParams({
            szModule: 'UserLiveWatchTimeData',
            szMethod: 'watch',
            szStartDate: firstDay,
            szEndDate: lastDay,
            nPage: '1',
            szId: userId,
          }).toString(),
        });

        const bsText = await bsRes.text();
        let bsData = {};
        try { bsData = JSON.parse(bsText); } catch {}

        if (bsData.result === 1 && bsData.data?.broad_cast_info) {
          watchSeconds = bsData.data.broad_cast_info.data?.cumulative_watch_time || 0;
          watchStreamers = (bsData.data.chart?.data_stack || [])
            .filter(s => s.bj_nick && s.bj_nick !== '기타')
            .map(s => ({
              name: s.bj_nick,
              seconds: (s.data || []).reduce((a, b) => a + b, 0),
            }))
            .filter(s => s.seconds >= 7200);
          bsMethod = 'bearer_success';
        } else {
          bsMethod = `bearer_failed_${bsRes.status}`;
        }
      } catch (e) {
        bsMethod = `bearer_error_${e.message}`;
      }
    }

    // 4. 세션 토큰
    const userHash = userId ? await sha256(`${userId}:${SESSION_SECRET}`) : '';
    const sessionToken = await sha256(`session:${userId}:${Date.now()}:${SESSION_SECRET}`);

    const params = new URLSearchParams({
      soop_ok: '1',
      token: sessionToken,
      hash: userHash,
      nick: userNick,
      avatar: profileImage,
      fan_cnt: String(favoriteCount),
      watch_sec: String(watchSeconds),
      bs_method: bsMethod,
      watch_streamers: JSON.stringify(watchStreamers),
    });

    return Response.redirect(`/?${params.toString()}`, 302);

  } catch (e) {
    return Response.redirect(`/?soop_error=exception&msg=${encodeURIComponent(e.message)}`, 302);
  }
}
