export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return Response.redirect('/?soop_error=no_code', 302);
    }

    const CLIENT_SECRET = env.SOOP_CLIENT_SECRET || '';
    const SESSION_SECRET = env.SESSION_SECRET || 'fallback';

    // code → access_token
    const body = `grant_type=authorization_code&client_id=a34f99ffbc82fcaabf6f8684bfdad71a&client_secret=${encodeURIComponent(CLIENT_SECRET)}&redirect_uri=https%3A%2F%2Fsoopnote.pages.dev%2Fauth%2Fcallback&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch('https://openapi.sooplive.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const tokenText = await tokenRes.text();
    let accessToken = '';
    try {
      const td = JSON.parse(tokenText);
      accessToken = td.access_token || '';
      if (!accessToken) {
        return Response.redirect(`/?soop_error=no_token&detail=${encodeURIComponent(tokenText.substring(0,100))}`, 302);
      }
    } catch(e) {
      return Response.redirect(`/?soop_error=parse_token&detail=${encodeURIComponent(tokenText.substring(0,100))}`, 302);
    }

    // access_token → 유저 정보
    let userId = '', userNick = '', profileImage = '', favoriteCount = 0;
    try {
      const userRes = await fetch('https://openapi.sooplive.com/user/stationinfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `access_token=${encodeURIComponent(accessToken)}`,
      });
      const ud = await userRes.json();
      const d = ud.data || {};
      userId = d.user_id || d.userId || '';
      userNick = d.user_nick || d.userNick || '';
      profileImage = d.profile_image || '';
      favoriteCount = d.favorite_cnt || 0;
    } catch(e) {
      return Response.redirect(`/?soop_error=userinfo&detail=${encodeURIComponent(e.message)}`, 302);
    }

    // broadstatistic 시청시간 (Bearer 방식)
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

        const bsText = await bsRes.text();
        let bsData = {};
        try { bsData = JSON.parse(bsText); } catch {}

        if (bsData.result === 1 && bsData.data?.broad_cast_info) {
          watchSeconds = bsData.data.broad_cast_info.data?.cumulative_watch_time || 0;
          watchStreamers = (bsData.data.chart?.data_stack || [])
            .filter(s => s.bj_nick && s.bj_nick !== '기타')
            .map(s => ({ name: s.bj_nick, seconds: (s.data||[]).reduce((a,b)=>a+b,0) }))
            .filter(s => s.seconds >= 7200);
          bsMethod = 'bearer_success';
        } else {
          bsMethod = `failed_${bsRes.status}_${bsText.substring(0,50)}`;
        }
      } catch(e) {
        bsMethod = `error_${e.message}`;
      }
    }

    // 세션 해시
    async function sha256(s) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
    }
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

    return Response.redirect(`/?${p.toString()}`, 302);

  } catch(e) {
    return Response.redirect(`/?soop_error=fatal&msg=${encodeURIComponent(String(e))}`, 302);
  }
}
