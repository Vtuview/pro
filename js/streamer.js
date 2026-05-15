(async function() {
  const slug = location.pathname.replace(/^\//, '').split('/')[0];
  if (!slug) { location.href = '/'; return; }

  // 타이틀 업데이트
  document.title = `SoopNote — ${slug}`;

  const profileSection = document.getElementById('profile-section');
  const noticeEl = document.getElementById('custom-notice');
  const authPrompt = document.getElementById('auth-prompt');
  const noteForm = document.getElementById('note-form');
  const watchBadge = document.getElementById('watch-badge');
  const notesList = document.getElementById('notes-list');

  // 1. 스트리머 DB 정보 + SOOP 프로필 병렬 로드
  async function loadProfile() {
    const [dbRes, soopRes] = await Promise.allSettled([
      SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id,name,profile_image,custom`),
      fetch(`/soop/profile?slug=${slug}`).then(r => r.json()),
    ]);

    const db = dbRes.status === 'fulfilled' ? dbRes.value[0] : null;
    const soop = soopRes.status === 'fulfilled' ? soopRes.value : {};

    if (!db) {
      profileSection.innerHTML = '<div class="loading">스트리머를 찾을 수 없습니다.</div>';
      return null;
    }

    const avatar = db.profile_image ||
      `https://profile.img.sooplive.com/LOGO/${slug.substring(0,2)}/${slug}/${slug}.jpg`;
    const name = db.name || soop.nick || slug;
    document.title = `SoopNote — ${name}`;

    profileSection.innerHTML = `
      <div class="profile-header">
        <img class="profile-avatar" src="${avatar}" alt="${name}"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><rect width=%2280%22 height=%2280%22 fill=%22%231e1e26%22/></svg>'">
        <div>
          <div class="profile-name">${name}</div>
          <div class="profile-slug">${slug}</div>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-item">
          <div class="stat-label">팬</div>
          <div class="stat-value">${(soop.fanCount||0).toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">팬클럽</div>
          <div class="stat-value">${(soop.fanclubCount||0).toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">이달 방송</div>
          <div class="stat-value">${soop.broadcastHours||0}시간</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">이달 풍선</div>
          <div class="stat-value">${(soop.balloons||0).toLocaleString()}</div>
        </div>
      </div>
    `;

    // 커스텀 공지
    const custom = db.custom || {};
    if (custom.notice) {
      noticeEl.textContent = custom.notice;
      noticeEl.style.display = 'block';
    }

    // 배경색 커스텀
    if (custom.bg_color) {
      document.body.style.setProperty('--bg', custom.bg_color);
    }

    return db.id;
  }

  // 2. 노트 목록 로드
  async function loadNotes(streamerId) {
    const notes = await SN.apiGet(
      `soop_notes?streamer_id=eq.${streamerId}&select=*&order=created_at.desc`
    );

    if (!notes.length) {
      notesList.innerHTML = '<div class="empty-notes">아직 작성된 노트가 없어요.<br>첫 번째 노트를 남겨보세요!</div>';
      return;
    }

    const fp = await SN.getFingerprint();

    notesList.innerHTML = notes.map(n => {
      const hours = Math.floor(n.watch_seconds / 3600);
      const date = new Date(n.created_at).toLocaleDateString('ko-KR');
      const isOwn = n.visitor_fingerprint === fp;
      const images = Array.isArray(n.image_urls) && n.image_urls.length
        ? `<div class="note-images">${n.image_urls.map(u =>
            `<img src="${u}" alt="첨부 이미지" onclick="window.open('${u}','_blank')">`
          ).join('')}</div>`
        : '';

      return `
        <div class="note-card" data-id="${n.id}">
          <div class="note-card-header">
            <span class="note-author">${hours}시간 시청자${isOwn ? ' · 내 노트' : ''}</span>
            <span class="note-date">${date}</span>
          </div>
          <div class="note-content">${escapeHtml(n.content)}</div>
          ${images}
        </div>
      `;
    }).join('');
  }

  // 3. 인증 + 폼 처리
  function setupAuthFlow(streamerId) {
    // 이미 인증됐는지 확인
    const auth = RecapAuth.getAuth();
    const watchSec = auth ? (auth.streamers.find(s => s.slug === slug)?.seconds || 0) : 0;

    if (auth && watchSec >= 7200) {
      showNoteForm(watchSec, streamerId);
    }

    // 인증 버튼
    document.getElementById('verify-btn').addEventListener('click', async () => {
      const url = document.getElementById('share-url-input').value.trim();
      const errEl = document.getElementById('auth-error');
      errEl.style.display = 'none';

      if (!url) { errEl.textContent = 'URL을 입력해주세요'; errEl.style.display = 'block'; return; }

      const btn = document.getElementById('verify-btn');
      btn.disabled = true;
      btn.textContent = '확인 중...';

      try {
        const data = await RecapAuth.verifyShareUrl(url);
        const s = data.streamers.find(s => s.slug === slug);
        if (!s) {
          errEl.textContent = '이 스트리머를 2시간 이상 시청한 기록이 없습니다.';
          errEl.style.display = 'block';
          return;
        }
        showNoteForm(s.seconds, streamerId);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = '인증하기';
      }
    });
  }

  async function showNoteForm(watchSec, streamerId) {
    authPrompt.style.display = 'none';
    noteForm.style.display = 'block';

    const h = Math.floor(watchSec / 3600);
    const m = Math.floor((watchSec % 3600) / 60);
    watchBadge.textContent = `✓ ${h}시간 ${m}분 시청자`;

    // 기존 본인 노트 있으면 내용 채우기
    const fp = await SN.getFingerprint();
    const existing = await SN.apiGet(
      `soop_notes?streamer_id=eq.${streamerId}&visitor_fingerprint=eq.${fp}&select=*&limit=1`
    ).catch(() => []);

    if (existing[0]) {
      document.getElementById('note-content').value = existing[0].content;
      document.getElementById('submit-note-btn').textContent = '노트 수정';
    }

    // 이미지 미리보기
    const imagesInput = document.getElementById('note-images');
    const previewEl = document.getElementById('image-preview');
    let selectedFiles = [];

    imagesInput.addEventListener('change', () => {
      selectedFiles = Array.from(imagesInput.files).slice(0, 2);
      previewEl.innerHTML = selectedFiles.map((f, i) => {
        const url = URL.createObjectURL(f);
        return `<img src="${url}" alt="미리보기 ${i+1}">`;
      }).join('');
    });

    // 제출
    document.getElementById('submit-note-btn').addEventListener('click', async () => {
      const content = document.getElementById('note-content').value.trim();
      const errEl = document.getElementById('submit-error');
      errEl.style.display = 'none';

      if (!content) { errEl.textContent = '내용을 입력해주세요'; errEl.style.display = 'block'; return; }

      const btn = document.getElementById('submit-note-btn');
      btn.disabled = true;
      btn.textContent = '등록 중...';

      try {
        // 이미지 업로드
        const imageUrls = [];
        for (const file of selectedFiles) {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/r2/upload', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
          imageUrls.push(data.url);
        }

        const watchSec2 = RecapAuth.getAuth()?.streamers.find(s => s.slug === slug)?.seconds || watchSec;

        if (existing[0]) {
          // 수정
          await SN.apiPatch(
            `soop_notes?id=eq.${existing[0].id}&visitor_fingerprint=eq.${fp}`,
            { content, watch_seconds: watchSec2, ...(imageUrls.length ? { image_urls: imageUrls } : {}) }
          );
        } else {
          // 신규
          await SN.apiPost('soop_notes', {
            streamer_id: streamerId,
            content,
            watch_seconds: watchSec2,
            image_urls: imageUrls,
            visitor_fingerprint: fp,
          }, 'return=minimal');
        }

        btn.textContent = '등록됨!';
        await loadNotes(streamerId);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = existing[0] ? '노트 수정' : '노트 등록';
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 실행
  const streamerId = await loadProfile();
  if (streamerId) {
    await loadNotes(streamerId);
    setupAuthFlow(streamerId);
  }
})();
