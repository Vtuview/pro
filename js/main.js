(async function() {
  const grid = document.getElementById('streamer-grid');

  try {
    // 스트리머 목록 + 최신 노트 순 정렬
    const streamers = await SN.apiGet(
      'soop_streamers?is_active=eq.true&select=id,slug,name,profile_image,custom' +
      '&order=created_at.desc'
    );

    // 각 스트리머 노트 수 가져오기
    const noteCountRes = await SN.apiGet(
      'soop_notes?select=streamer_id&order=created_at.desc'
    );

    // streamer_id별 노트 수 + 최신 노트 시간 집계
    const noteMap = {};
    noteCountRes.forEach(n => {
      if (!noteMap[n.streamer_id]) noteMap[n.streamer_id] = { count: 0 };
      noteMap[n.streamer_id].count++;
    });

    if (!streamers.length) {
      grid.innerHTML = '<div class="loading">등록된 스트리머가 없습니다.</div>';
      return;
    }

    // 노트 많은 순 정렬
    streamers.sort((a, b) => {
      const ac = noteMap[a.id]?.count || 0;
      const bc = noteMap[b.id]?.count || 0;
      return bc - ac;
    });

    grid.innerHTML = streamers.map(s => {
      const noteCount = noteMap[s.id]?.count || 0;
      const avatar = s.profile_image ||
        `https://profile.img.sooplive.com/LOGO/${s.slug.substring(0,2)}/${s.slug}/${s.slug}.jpg`;

      return `
        <a href="/${s.slug}" class="streamer-card">
          <img class="streamer-card-avatar" src="${avatar}"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22><rect width=%2264%22 height=%2264%22 fill=%22%231e1e26%22/></svg>'"
            alt="${s.name}">
          <div class="streamer-card-name">${s.name}</div>
          <div class="streamer-card-meta">${s.slug}</div>
          <span class="streamer-card-note-count">노트 ${noteCount}개</span>
        </a>
      `;
    }).join('');

  } catch (e) {
    grid.innerHTML = `<div class="loading">오류: ${e.message}</div>`;
  }
})();
