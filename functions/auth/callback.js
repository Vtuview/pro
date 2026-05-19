const BASE_URL = 'https://soopnote.pages.dev';
const SOOP_TOKEN_URL = 'https://openapi.sooplive.com/auth/token';
const SOOP_USERINFO_URL = 'https://openapi.sooplive.com/user/stationinfo';
const CLIENT_ID = 'a34f99ffbc82fcaabf6f8684bfdad71a';
const REDIRECT_URI = 'https://soopnote.pages.dev/auth/callback';

function redirect(path) {
  return Response.redirect(`${BASE_URL}${path}`, 302);
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const CLIENT_SECRET = env.SOOP_CLIENT_SECRET || '';
    const SESSION_SECRET = env.SESSION_SECRET || 'fallback';

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return redirect('/?soop_error=no_code');

    // 1. code → access_token
    const tokenRes = await fetch(SOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${encodeURIComponent(code)}`,
    });

    let accessToken = '';
    try {
      const td = await tokenRes.json();
      accessToken = td.access_token || '';
      if (!accessToken) return redirect(`/?soop_error=no_token&detail=${encodeURIComponent(td.error_description||td.error||'')}`);
    } catch(e) {
      return redirect(`/?soop_error=token_parse`);
    }

    // 2. access_token → 유저 정보
    let userId = '', userNick = '', profileImage = '', favoriteCount = 0;
    try {
      const userRes = await fetch(SOOP_USERINFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `access_token=${encodeURIComponent(accessToken)}`,
      });
      const ud = await userRes.json();
      const d = ud.data || {};
      // SOOP API는 user_id 대신 user_nick이 실제 아이디
      userNick = d.user_nick || d.userNick || '';
      userId = userNick; // user_nick = SOOP 아이디 (broadstatistic szId에 사용)
      profileImage = d.profile_image || '';
      favoriteCount = d.favorite_cnt || 0;
    } catch(e) {
      return redirect(`/?soop_error=userinfo`);
    }

    // 3. broadstatistic 시청시간 (Bearer 방식)
    let watchSeconds = 0;
    let watchStreamers = [];
    let bsMethod = 'not_tried';

    if (userId) {
      try {
        const now = new Date();
        const y = now.getFullYear();
        const mo = String(now.getMonth()+1).padStart(2,'0');
        const first = `${y}-${mo}-01`;
        const last = `${y}-${mo}-${new Date(y,now.getMonth()+1,0).getDate()}`;

        const bsRes = await fetch('https://broadstatistic.sooplive.com/api/watch_statistic.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://broadstatistic.sooplive.com',
            'Referer': 'https://broadstatistic.sooplive.com/',
          },
          body: `szModule=UserLiveWatchTimeData&szMethod=watch&szStartDate=${first}&szEndDate=${last}&nPage=1&szId=${encodeURIComponent(userId)}`,
        });

        const bsStatus = bsRes.status;
        let bsData = {};
        try { bsData = await bsRes.json(); } catch {}

        if (bsData.result === 1 && bsData.data?.broad_cast_info) {
          watchSeconds = bsData.data.broad_cast_info.data?.cumulative_watch_time || 0;
          watchStreamers = (bsData.data.chart?.data_stack || [])
            .filter(s => s.bj_nick && s.bj_nick !== '기타')
            .map(s => ({ name: s.bj_nick, seconds: (s.data||[]).reduce((a,b)=>a+b,0) }))
            .filter(s => s.seconds >= 7200);
          bsMethod = 'bearer_success';
        } else {
          bsMethod = `failed_${bsStatus}`;
        }
      } catch(e) {
        bsMethod = `error`;
      }
    }

    // 4. 세션
    const userHash = userId ? await sha256(`${userId}:${SESSION_SECRET}`) : '';
    const sessionToken = await sha256(`session:${userId}:${Date.now()}:${SESSION_SECRET}`);

    const p = new URLSearchParams({
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

    return Response.redirect(`${BASE_URL}/?${p.toString()}`, 302);

  } catch(e) {
    return Response.redirect(`${BASE_URL}/?soop_error=fatal&msg=${encodeURIComponent(String(e))}`, 302);
  }
}
