// GET /auth/callback?code=xxx
// SOOP OAuth code → access_token → user info → 세션 쿠키 설정

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
  const SESSION_SECRET = env.SESSION_SECRET || env.EDITOR_SECRET;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return Response.redirect('/?soop_error=1', 302);
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
      }),
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return Response.redirect(`/?soop_error=token&msg=${encodeURIComponent(t)}`, 302);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || '';

    if (!accessToken) {
      return Response.redirect('/?soop_error=no_token', 302);
    }

    // 2. access_token → 유저 정보
    const userRes = await fetch(SOOP_USERINFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken }),
    });

    let userId = '';
    let userNick = '';
    let profileImage = '';
    let favoriteCount = 0;

    if (userRes.ok) {
      const userData = await userRes.json();
      const d = userData.data || {};
      userId = d.user_id || d.userId || '';
      userNick = d.user_nick || d.userNick || '';
      profileImage = d.profile_image || '';
      favoriteCount = d.favorite_cnt || 0;
    }

    // broadstatistic 시청시간 시도 (access_token or 쿠키 방식)
    // 일단 이달 시청시간 조회 테스트
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${year}-${month}-01`;
    const lastDay = `${year}-${month}-${new Date(year, now.getMonth()+1, 0).getDate()}`;

    let watchSeconds = 0;
    let watchStreamers = [];

    // broadstatistic API - Authorization Bearer 방식 시도
    const bsRes = await fetch('https://broadstatistic.sooplive.com/api/watch_statistic.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Mozilla/5.0',
      },
      body: new URLSearchParams({
        szModule: 'UserLiveWatchTimeData',
        szMethod: 'watch',
        szStartDate: firstDay,
        szEndDate: lastDay,
        nPage: 1,
        szId: userId,
      }),
    });

    let bsMethod = 'bearer_failed';
    if (bsRes.ok) {
      const bsData = await bsRes.json();
      if (bsData.result === 1 && bsData.data?.broad_cast_info) {
        watchSeconds = bsData.data.broad_cast_info.data.cumulative_watch_time || 0;
        watchStreamers = (bsData.data.chart?.data_stack || [])
          .filter(s => s.bj_nick !== '기타')
          .map(s => ({
            name: s.bj_nick,
            seconds: (s.data || []).reduce((a, b) => a + b, 0),
          }))
          .filter(s => s.seconds >= 7200);
        bsMethod = 'bearer_success';
      }
    }

    // 3. 세션 토큰 생성 (userId hash)
    const userHash = await sha256(`${userId}:${SESSION_SECRET}`);
    const sessionToken = await sha256(`session:${userId}:${Date.now()}:${SESSION_SECRET}`);

    // 4. 결과를 쿼리파람으로 전달 (클라이언트에서 sessionStorage 저장)
    const params = new URLSearchParams({
      soop_ok: '1',
      token: sessionToken,
      hash: userHash,
      nick: userNick,
      avatar: profileImage,
      fan_cnt: favoriteCount,
      watch_sec: watchSeconds,
      bs_method: bsMethod,
      watch_streamers: JSON.stringify(watchStreamers),
    });

    return Response.redirect(`/?${params.toString()}`, 302);

  } catch (e) {
    return Response.redirect(`/?soop_error=exception&msg=${encodeURIComponent(e.message)}`, 302);
  }
}
