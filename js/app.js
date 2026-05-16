// SPA 라우터 - pathname 기반으로 페이지 분기
(async function () {
  const path = location.pathname;
  const isEdit = path.startsWith('/edit/');
  const isAdmin = path === '/sys/ctrl';
  const isMain = path === '/' || path === '/index.html';
  const slug = (!isMain && !isEdit && !isAdmin)
    ? path.replace(/^\//, '').split('/')[0]
    : null;
  const editSlug = isEdit
    ? path.replace('/edit/', '').split('/')[0]
    : null;

  // 페이지 표시
  document.getElementById('page-main').style.display = isMain ? 'block' : 'none';
  document.getElementById('page-streamer').style.display = slug ? 'block' : 'none';
  document.getElementById('page-edit').style.display = isEdit ? 'block' : 'none';
  document.getElementById('page-admin').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('back-btn').style.display = (!isMain) ? 'inline' : 'none';
  document.getElementById('auth-btn').style.display = (isEdit || isAdmin) ? 'none' : 'inline-block';
  document.getElementById('header-tagline').style.display = isMain ? 'inline' : 'none';
  document.getElementById('hard-refresh-btn').style.display = (isEdit || isAdmin) ? 'none' : 'inline-block';

  if (slug) document.title = `SoopNote — ${slug}`;
  if (isAdmin) document.title = 'SoopNote Admin';

  if (isMain) await initMain();
  else if (slug) await initStreamer(slug);
  else if (isEdit) await initEdit(editSlug);
  else if (isAdmin) await initAdmin();
})();

/* ─────────────── 메인 ─────────────── */
async function initMain() {
  const grid = document.getElementById('streamer-grid');
  const overlay = document.getElementById('modal-overlay');
  const stepAuth = document.getElementById('step-auth');
  const stepSelect = document.getElementById('step-select');
  const stepWrite = document.getElementById('step-write');
  const authBtn = document.getElementById('auth-btn');
  const authStatus = document.getElementById('auth-status');

  const ratings = { avatar: 0, song: 0, talk: 0, attend: 0 };
  let selectedStreamer = null;
  let selectedFiles = [];

  // 별점
  document.querySelectorAll('.stars:not([data-page])').forEach(el => {
    const key = el.dataset.key;
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.className = 'star'; s.textContent = '★'; s.dataset.val = i;
      s.addEventListener('click', () => {
        ratings[key] = i;
        el.querySelectorAll('.star').forEach(st =>
          st.classList.toggle('active', Number(st.dataset.val) <= i));
      });
      el.appendChild(s);
    }
  });

  function openModal(id) {
    overlay.style.display = 'flex';
    [stepAuth, stepSelect, stepWrite].forEach(e => e.style.display = 'none');
    document.getElementById(id).style.display = 'block';
  }
  function closeModal() { overlay.style.display = 'none'; }

  ['modal-close','modal-close2','modal-close3'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', closeModal));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  function checkAuth() {
    if (RecapAuth.isAuthenticated()) {
      authBtn.textContent = '노트 작성';
      authStatus.textContent = '✓ 인증됨';
      authStatus.style.display = 'inline';
    }
  }
  checkAuth();

  // 캐시 삭제 새로고침
  document.getElementById('hard-refresh-btn')?.addEventListener('click', () => {
    // 캐시 강제 무효화 후 새로고침
    if ('caches' in window) {
      caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));
    }
    location.reload();
  });

  authBtn.addEventListener('click', () => {
    if (RecapAuth.isAuthenticated()) showSelect();
    else openModal('step-auth');
  });

  document.getElementById('verify-btn').addEventListener('click', async () => {
    const url = document.getElementById('share-url-input').value.trim();
    const errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';
    if (!url) { errEl.textContent = 'URL 입력'; errEl.style.display = 'block'; return; }
    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = '확인 중...';
    try {
      await RecapAuth.verifyShareUrl(url);
      checkAuth();
      showSelect();
    } catch (e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = '인증하기'; }
  });

  async function showSelect() {
    const list = document.getElementById('streamer-select-list');
    const streamers = RecapAuth.getEligibleStreamers();
    openModal('step-select');
    list.innerHTML = '<div class="loading" style="padding:20px;">확인 중...</div>';

    // 기존 작성 여부 확인
    const fp = await SN.getFingerprint();
    let writtenSlugs = new Set();
    try {
      // slug → streamer_id 매핑
      const slugList = streamers.map(s => s.slug).join(',');
      const rows = await SN.apiGet(`soop_streamers?slug=in.(${slugList})&select=id,slug`);
      if (rows.length) {
        const idList = rows.map(r => r.id).join(',');
        const notes = await SN.apiGet(
          `soop_notes?streamer_id=in.(${idList})&visitor_fingerprint=eq.${fp}&select=streamer_id`
        );
        const writtenIds = new Set(notes.map(n => n.streamer_id));
        rows.forEach(r => { if (writtenIds.has(r.id)) writtenSlugs.add(r.slug); });
      }
    } catch {}

    list.innerHTML = streamers.map(s => {
      const h = Math.floor(s.seconds/3600), m = Math.floor((s.seconds%3600)/60);
      const written = writtenSlugs.has(s.slug);
      return `<div class="streamer-select-item ${written ? 'written' : ''}" data-slug="${s.slug}" data-name="${s.name}" data-seconds="${s.seconds}">
        <span class="streamer-select-name">${s.name}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${written ? '<span class="written-badge">작성함</span>' : ''}
          <span class="streamer-select-time">${h}시간 ${m > 0 ? m+'분' : ''} 시청</span>
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.streamer-select-item').forEach(el =>
      el.addEventListener('click', () => {
        selectedStreamer = { slug: el.dataset.slug, name: el.dataset.name, seconds: Number(el.dataset.seconds) };
        showWrite();
      }));
  }

  async function showWrite() {
    Object.keys(ratings).forEach(k => ratings[k] = 0);
    document.querySelectorAll('.stars:not([data-page]) .star').forEach(s => s.classList.remove('active'));
    document.getElementById('note-content').value = '';
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('write-error').style.display = 'none';
    document.getElementById('submit-btn').textContent = '노트 등록';
    selectedFiles = [];
    openModal('step-write');
    document.getElementById('write-title').textContent = `${selectedStreamer.name} — 노트 작성`;
    const h = Math.floor(selectedStreamer.seconds/3600), m = Math.floor((selectedStreamer.seconds%3600)/60);
    document.getElementById('write-watch-badge').textContent = `✓ ${h}시간 ${m > 0 ? m+'분' : ''} 시청자`;

    const inp = document.getElementById('note-images');
    const prev = document.getElementById('image-preview');
    const lbl = document.querySelector('.upload-label');
    const newInp = inp.cloneNode(true); inp.parentNode.replaceChild(newInp, inp);
    const newLbl = lbl.cloneNode(true); lbl.parentNode.replaceChild(newLbl, lbl);
    newLbl.addEventListener('click', () => newInp.click());
    newInp.addEventListener('change', () => {
      selectedFiles = Array.from(newInp.files).slice(0, 2);
      prev.innerHTML = selectedFiles.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
    });
  }

  document.getElementById('submit-btn').addEventListener('click', async () => {
    if (!selectedStreamer) return;
    const content = document.getElementById('note-content').value.trim();
    const errEl = document.getElementById('write-error');
    errEl.style.display = 'none';
    if (!content && !Object.values(ratings).some(v => v > 0)) {
      errEl.textContent = '내용 또는 별점을 입력해주세요'; errEl.style.display = 'block'; return;
    }
    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = '등록 중...';
    try {
      const fp = await SN.getFingerprint();
      const { slug, name, seconds } = selectedStreamer;

      // 스트리머 GET → 없으면 INSERT
      let streamerId;
      const rows = await SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id`);
      if (rows.length) {
        streamerId = rows[0].id;
      } else {
        const soop = await fetch(`/soop/profile?slug=${slug}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        try {
          const created = await SN.apiPost('soop_streamers', {
            slug, name: name || soop.nick || slug,
            profile_image: soop.profileImage || null, auto_created: true,
          }, 'return=representation');
          streamerId = created[0].id;
        } catch {
          const retry = await SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id`);
          streamerId = retry[0]?.id;
          if (!streamerId) throw new Error('스트리머 생성 실패');
        }
      }

      // 이미지 업로드
      const imageUrls = [];
      for (const file of selectedFiles) {
        const fd = new FormData(); fd.append('file', file);
        const res = await fetch('/r2/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
        imageUrls.push(data.url);
      }

      await SN.apiPost('soop_notes', {
        streamer_id: streamerId, content: content || '', watch_seconds: seconds,
        image_urls: imageUrls, visitor_fingerprint: fp,
        rating_avatar: ratings.avatar || null, rating_song: ratings.song || null,
        rating_talk: ratings.talk || null, rating_attend: ratings.attend || null,
      }, 'return=minimal');

      closeModal();
      // 토스트 + 페이지 이동
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e26;border:1px solid #4ade80;color:#4ade80;padding:12px 20px;border-radius:8px;font-size:13px;z-index:9999;display:flex;align-items:center;gap:12px;';
      t.innerHTML = `<span>노트 등록 완료!</span><a href="/${slug}" style="color:#7c3aed;font-weight:500;text-decoration:none;">페이지 보기 →</a>`;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4000);
      await loadGrid();
    } catch (e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = '노트 등록';
    }
  });

  async function loadGrid() {
    try {
      const [streamers, notes] = await Promise.all([
        SN.apiGet('soop_streamers?is_active=eq.true&select=id,slug,name,profile_image&order=created_at.desc'),
        SN.apiGet('soop_notes?select=streamer_id,rating_avatar,rating_song,rating_talk,rating_attend,created_at'),
      ]);
      const statsMap = {};
      notes.forEach(n => {
        if (!statsMap[n.streamer_id]) statsMap[n.streamer_id] = { count:0, rSum:0, rCount:0, latest:n.created_at };
        const s = statsMap[n.streamer_id];
        s.count++;
        if (n.created_at > s.latest) s.latest = n.created_at;
        const vals = [n.rating_avatar,n.rating_song,n.rating_talk,n.rating_attend].filter(v=>v!==null);
        if (vals.length) { s.rSum += vals.reduce((a,b)=>a+b,0)/vals.length; s.rCount++; }
      });
      if (!streamers.length) { grid.innerHTML = '<div class="loading">아직 노트가 없어요. 인증하고 첫 노트를 남겨보세요!</div>'; return; }
      streamers.sort((a,b) => (statsMap[b.id]?.latest||b.created_at) > (statsMap[a.id]?.latest||a.created_at) ? 1 : -1);
      grid.innerHTML = streamers.map(s => {
        const st = statsMap[s.id] || {};
        const avg = st.rCount ? (st.rSum/st.rCount).toFixed(1) : null;
        const avatar = s.profile_image || `https://profile.img.sooplive.com/LOGO/${s.slug.substring(0,2)}/${s.slug}/${s.slug}.jpg`;
        return `<a href="/${s.slug}" class="streamer-card">
          <img class="streamer-card-avatar" src="${avatar}" alt="${s.name}"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22%231e1e26%22/></svg>'">
          <div class="streamer-card-name">${s.name}</div>
          ${avg ? `<div class="streamer-card-rating">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))} <span style="color:var(--text2);font-size:11px;">${avg}</span></div>` : ''}
          <div class="streamer-card-meta">${s.slug}</div>
          <span class="streamer-card-note-count">노트 ${st.count||0}개</span>
        </a>`;
      }).join('');
    } catch(e) { grid.innerHTML = `<div class="loading">오류: ${e.message}</div>`; }
  }

  await loadGrid();
}

/* ─────────────── 스트리머 페이지 ─────────────── */
async function initStreamer(slug) {
  // 헤더 버튼
  document.getElementById('hard-refresh-btn')?.addEventListener('click', () => {
    if ('caches' in window) {
      caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));
    }
    location.reload();
  });
  document.getElementById('auth-btn')?.addEventListener('click', () => {
    const auth = RecapAuth.getAuth();
    const s = auth?.streamers?.find(s => s.slug === slug);
    if (s?.seconds >= 7200) openWriteS(s.seconds);
    else openS('step-auth-s');
  });

  const profileSection = document.getElementById('profile-section');
  const noticeEl = document.getElementById('custom-notice');
  const notesList = document.getElementById('notes-list');
  const overlayS = document.getElementById('modal-overlay-s');
  const stepAuthS = document.getElementById('step-auth-s');
  const stepWriteS = document.getElementById('step-write-s');

  const ratingsS = { avatar:0, song:0, talk:0, attend:0 };
  let streamerIdS = null;
  let selectedFilesS = [];

  // 별점
  document.querySelectorAll('.stars[data-page="s"]').forEach(el => {
    const key = el.dataset.key;
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.className = 'star'; s.textContent = '★'; s.dataset.val = i;
      s.addEventListener('click', () => {
        ratingsS[key] = i;
        el.querySelectorAll('.star').forEach(st =>
          st.classList.toggle('active', Number(st.dataset.val) <= i));
      });
      el.appendChild(s);
    }
  });

  function openS(id) {
    overlayS.style.display = 'flex';
    [stepAuthS, stepWriteS].forEach(e => e.style.display = 'none');
    document.getElementById(id).style.display = 'block';
  }
  function closeS() { overlayS.style.display = 'none'; }

  ['modal-close-s','modal-close-s2'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', closeS));
  overlayS.addEventListener('click', e => { if (e.target === overlayS) closeS(); });

  document.getElementById('streamer-auth-btn').addEventListener('click', () => {
    const auth = RecapAuth.getAuth();
    const s = auth?.streamers?.find(s => s.slug === slug);
    if (s?.seconds >= 7200) openWriteS(s.seconds);
    else openS('step-auth-s');
  });

  document.getElementById('verify-btn-s').addEventListener('click', async () => {
    const url = document.getElementById('share-url-input-s').value.trim();
    const errEl = document.getElementById('auth-error-s');
    errEl.style.display = 'none';
    if (!url) { errEl.textContent = 'URL 입력'; errEl.style.display = 'block'; return; }
    const btn = document.getElementById('verify-btn-s');
    btn.disabled = true; btn.textContent = '확인 중...';
    try {
      const data = await RecapAuth.verifyShareUrl(url);
      const s = data.streamers.find(s => s.slug === slug);
      if (!s) { errEl.textContent = '이 스트리머를 2시간 이상 시청한 기록이 없어요.'; errEl.style.display = 'block'; return; }
      openWriteS(s.seconds);
    } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    finally { btn.disabled = false; btn.textContent = '인증하기'; }
  });

  let editingNoteId = null; // 수정 중인 노트 ID

  function openWriteS(watchSec, existingNote = null) {
    Object.keys(ratingsS).forEach(k => ratingsS[k] = 0);
    document.querySelectorAll('.stars[data-page="s"] .star').forEach(s => s.classList.remove('active'));
    document.getElementById('note-content-s').value = '';
    document.getElementById('image-preview-s').innerHTML = '';
    document.getElementById('write-error-s').style.display = 'none';
    selectedFilesS = [];
    editingNoteId = null;

    // 기존 내 노트 자동 불러오기 (수정 모드)
    if (!existingNote && streamerIdS) {
      SN.getFingerprint().then(fp => {
        SN.apiGet(`soop_notes?streamer_id=eq.${streamerIdS}&visitor_fingerprint=eq.${fp}&select=*&limit=1`)
          .then(rows => {
            if (!rows[0]) return;
            editingNoteId = rows[0].id;
            document.getElementById('note-content-s').value = rows[0].content || '';
            document.getElementById('submit-btn-s').textContent = '노트 수정';
            document.getElementById('write-title-s').textContent = '내 노트 수정';
            // 기존 별점 복원
            ['avatar','song','talk','attend'].forEach(key => {
              const val = rows[0][`rating_${key}`];
              if (!val) return;
              ratingsS[key] = val;
              document.querySelector(`.stars[data-page="s"][data-key="${key}"]`)
                ?.querySelectorAll('.star').forEach(st =>
                  st.classList.toggle('active', Number(st.dataset.val) <= val));
            });
            // 안내 배지
            const badge = document.getElementById('write-watch-badge-s');
            badge.innerHTML = badge.innerHTML + ' &nbsp;<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--accent);padding:2px 8px;border-radius:999px;border:1px solid rgba(124,58,237,0.2);">이미 작성한 노트가 있어요 — 수정됩니다</span>';
          }).catch(() => {});
      });
    }

    openS('step-write-s');
    const h = Math.floor(watchSec/3600), m = Math.floor((watchSec%3600)/60);
    document.getElementById('write-watch-badge-s').textContent = `✓ ${h}시간 ${m > 0 ? m+'분' : ''} 시청자`;

    if (existingNote) {
      editingNoteId = existingNote.id;
      document.getElementById('note-content-s').value = existingNote.content || '';
      document.getElementById('write-title-s').textContent = '노트 수정';
      document.getElementById('submit-btn-s').textContent = '수정 완료';
      // 별점 복원
      ['avatar','song','talk','attend'].forEach(key => {
        const val = existingNote[`rating_${key}`];
        if (val) {
          ratingsS[key] = val;
          document.querySelector(`.stars[data-page="s"][data-key="${key}"]`)
            ?.querySelectorAll('.star').forEach(st =>
              st.classList.toggle('active', Number(st.dataset.val) <= val));
        }
      });
    } else {
      editingNoteId = null;
      document.getElementById('write-title-s').textContent = '노트 작성';
      document.getElementById('submit-btn-s').textContent = '노트 등록';
    }
    const inp = document.getElementById('note-images-s');
    const prev = document.getElementById('image-preview-s');
    const lbl = document.querySelector('.upload-label-s');
    lbl.onclick = () => inp.click();
    inp.onchange = () => {
      selectedFilesS = Array.from(inp.files).slice(0, 2);
      prev.innerHTML = selectedFilesS.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
    };
  }

  document.getElementById('submit-btn-s').addEventListener('click', async () => {
    const content = document.getElementById('note-content-s').value.trim();
    const errEl = document.getElementById('write-error-s');
    errEl.style.display = 'none';
    if (!content && !Object.values(ratingsS).some(v => v > 0)) {
      errEl.textContent = '내용 또는 별점을 입력해주세요'; errEl.style.display = 'block'; return;
    }
    const btn = document.getElementById('submit-btn-s');
    btn.disabled = true; btn.textContent = '등록 중...';
    try {
      const fp = await SN.getFingerprint();
      const watchSec = RecapAuth.getAuth()?.streamers?.find(s => s.slug === slug)?.seconds || 7200;

      if (!streamerIdS) {
        const soop = await fetch(`/soop/profile?slug=${slug}`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        try {
          const created = await SN.apiPost('soop_streamers', {
            slug, name: soop.nick || slug, profile_image: soop.profileImage || null, auto_created: true,
          }, 'return=representation');
          streamerIdS = created[0].id;
        } catch {
          const retry = await SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id`);
          streamerIdS = retry[0]?.id;
        }
      }

      const imageUrls = [];
      for (const file of selectedFilesS) {
        const fd = new FormData(); fd.append('file', file);
        const res = await fetch('/r2/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        imageUrls.push(data.url);
      }

      const payload = {
        content: content || '', watch_seconds: watchSec, image_urls: imageUrls,
        rating_avatar: ratingsS.avatar||null, rating_song: ratingsS.song||null,
        rating_talk: ratingsS.talk||null, rating_attend: ratingsS.attend||null,
      };

      if (editingNoteId) {
        // 수정
        const res = await fetch(`/api/soop_notes?id=eq.${editingNoteId}&visitor_fingerprint=eq.${fp}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('수정 실패');
      } else {
        // 신규
        await SN.apiPost('soop_notes', {
          ...payload, streamer_id: streamerIdS, visitor_fingerprint: fp,
        }, 'return=minimal');
      }

      closeS();
      await loadNotes();
    } catch(e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = '노트 등록';
    }
  });

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function starStr(v) { if(!v) return '-'; const f=Math.round(v); return '★'.repeat(f)+'☆'.repeat(5-f); }
  function calcRating(notes) {
    const keys = ['rating_avatar','rating_song','rating_talk','rating_attend'];
    const r = {};
    keys.forEach(k => { const v=notes.map(n=>n[k]).filter(x=>x!==null); r[k]=v.length?v.reduce((a,b)=>a+b,0)/v.length:null; });
    return r;
  }

  async function loadProfile() {
    const [dbRes, soopRes] = await Promise.allSettled([
      SN.apiGet(`soop_streamers?slug=eq.${slug}&select=*`),
      fetch(`/soop/profile?slug=${slug}`).then(r=>r.json()),
    ]);
    const db = dbRes.status==='fulfilled' ? dbRes.value[0] : null;
    const soop = soopRes.status==='fulfilled' ? soopRes.value : {};
    const name = db?.name || soop.nick || slug;
    document.title = `SoopNote — ${name}`;
    if (db) streamerIdS = db.id;

    const avatar = db?.profile_image || soop.profileImage ||
      `https://profile.img.sooplive.com/LOGO/${slug.substring(0,2)}/${slug}/${slug}.jpg`;

    const notes = db ? await SN.apiGet(`soop_notes?streamer_id=eq.${db.id}&select=rating_avatar,rating_song,rating_talk,rating_attend,created_at&order=created_at.desc`).catch(()=>[]) : [];
    const avgR = calcRating(notes);
    const totalVals = ['rating_avatar','rating_song','rating_talk','rating_attend'].map(k=>avgR[k]).filter(v=>v!==null);
    const totalVal = totalVals.length ? (totalVals.reduce((a,b)=>a+b,0)/totalVals.length).toFixed(1) : null;
    const lastCast = soop.lastBroadcast ? new Date(soop.lastBroadcast).toLocaleDateString('ko-KR') : '-';
    const lastReview = notes[0]?.created_at ? new Date(notes[0].created_at).toLocaleDateString('ko-KR') : '-';

    profileSection.innerHTML = `
      <div class="profile-banner"></div>
      <div class="profile-top">
        <img class="profile-avatar" src="${avatar}" alt="${name}"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%231e1e26%22 rx=%2250%22/></svg>'">
        <div class="profile-info"><div class="profile-name">${name}</div><div class="profile-slug">${slug}</div></div>
      </div>
      <div class="rating-table">
        <div class="rating-table-grid">
          <div class="rating-cell"><span class="rating-cell-label">아바타</span><span class="rating-cell-stars">${starStr(avgR.rating_avatar)}</span><span class="rating-cell-val">${avgR.rating_avatar?avgR.rating_avatar.toFixed(1):'-'}</span></div>
          <div class="rating-cell"><span class="rating-cell-label">소통</span><span class="rating-cell-stars">${starStr(avgR.rating_talk)}</span><span class="rating-cell-val">${avgR.rating_talk?avgR.rating_talk.toFixed(1):'-'}</span></div>
          <div class="rating-cell"><span class="rating-cell-label">노래</span><span class="rating-cell-stars">${starStr(avgR.rating_song)}</span><span class="rating-cell-val">${avgR.rating_song?avgR.rating_song.toFixed(1):'-'}</span></div>
          <div class="rating-cell"><span class="rating-cell-label">출석률</span><span class="rating-cell-stars">${starStr(avgR.rating_attend)}</span><span class="rating-cell-val">${avgR.rating_attend?avgR.rating_attend.toFixed(1):'-'}</span></div>
        </div>
        <div class="rating-total"><span class="rating-total-label">TOTAL</span><span class="rating-total-val">${totalVal?totalVal+' / 5.0':'- / 5.0'}</span></div>
      </div>
      <div class="profile-meta-row">
        <div class="meta-item"><div class="meta-label">REVIEW</div><div class="meta-value">${lastReview}</div></div>
        <div class="meta-item"><div class="meta-label">LAST CAST</div><div class="meta-value">${lastCast}</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-label">누적방송</div><div class="stat-value">${(soop.totalBroadHours||0).toLocaleString()}h</div></div>
        <div class="stat-item"><div class="stat-label">애정자</div><div class="stat-value">${(soop.fanCount||0).toLocaleString()}</div></div>
        <div class="stat-item"><div class="stat-label">팬클럽</div><div class="stat-value">${(soop.fanclubCount||0).toLocaleString()}</div></div>
        <div class="stat-item"><div class="stat-label">구독</div><div class="stat-value">${(soop.subscribers||0).toLocaleString()}</div></div>
      </div>`;

    // 풍선/방송 히스토리 차트
    if (soop.balloonHistory || soop.broadcastHistory) {
      const chartSection = document.createElement('div');
      chartSection.className = 'history-charts';
      chartSection.innerHTML = buildCharts(soop.balloonHistory || {}, soop.broadcastHistory || {});
      profileSection.appendChild(chartSection);
    }

    const custom = db?.custom || {};
    if (custom.notice) { noticeEl.textContent = custom.notice; noticeEl.style.display = 'block'; }
    if (custom.bg_color) document.documentElement.style.setProperty('--bg', custom.bg_color);

    // 배너 이미지 적용
    const bannerEl = profileSection.querySelector('.profile-banner');
    if (bannerEl && custom.banner) {
      bannerEl.style.backgroundImage = `url('${custom.banner}')`;
      bannerEl.style.backgroundSize = 'cover';
      bannerEl.style.backgroundPosition = 'center';
    }
  }

  function buildCharts(balloonH, broadcastH) {
    const months = Object.keys({ ...balloonH, ...broadcastH })
      .sort().slice(-6); // 오래된 순 → 최신이 아래

    const bMax = Math.max(...months.map(m => balloonH[m] || 0), 1);
    const hMax = Math.max(...months.map(m => broadcastH[m] || 0), 1);

    function bar(val, max, color) {
      const pct = Math.round((val / max) * 100);
      return `<div class="bar-wrap">
        <div class="bar-fill" style="width:${pct}%;background:${color};"></div>
        <span class="bar-val">${val.toLocaleString()}</span>
      </div>`;
    }

    const balloonRows = months.map(m => {
      const label = m.replace(/^20/, '').replace('-', '/');
      return `<div class="chart-row">
        <div class="chart-label">${label}</div>
        <div class="chart-bars">${bar(balloonH[m] || 0, bMax, '#f472b6')}</div>
      </div>`;
    }).join('');

    const broadRows = months.map(m => {
      const label = m.replace(/^20/, '').replace('-', '/');
      return `<div class="chart-row">
        <div class="chart-label">${label}</div>
        <div class="chart-bars">${bar(broadcastH[m] || 0, hMax, '#60a5fa')}</div>
      </div>`;
    }).join('');

    return `
      <div class="chart-section">
        <div class="chart-title">
          <span class="legend-dot" style="background:#f472b6;"></span>별풍선
        </div>
        ${balloonRows}
      </div>
      <div class="chart-section" style="border-top:1px solid var(--border);">
        <div class="chart-title">
          <span class="legend-dot" style="background:#60a5fa;"></span>방송시간
        </div>
        ${broadRows}
      </div>`;
  }

  async function loadNotes() {
    if (!streamerIdS) { notesList.innerHTML = '<div class="empty-notes">아직 노트가 없어요.<br>인증하고 첫 노트를 남겨보세요!</div>'; return; }
    const notes = await SN.apiGet(`soop_notes?streamer_id=eq.${streamerIdS}&select=*&order=created_at.desc`).catch(()=>[]);
    const fp = await SN.getFingerprint();
    if (!notes.length) { notesList.innerHTML = '<div class="empty-notes">아직 노트가 없어요.<br>인증하고 첫 노트를 남겨보세요!</div>'; return; }
    // 수정할 노트 데이터 캐시
    const notesCache = {};
    notes.forEach(n => { notesCache[n.id] = n; });

    notesList.innerHTML = notes.map(n => {
      const h = Math.floor(n.watch_seconds/3600);
      const date = new Date(n.created_at).toLocaleDateString('ko-KR');
      const isOwn = n.visitor_fingerprint === fp;
      const rStr = [n.rating_avatar&&`아바타 ${'★'.repeat(n.rating_avatar)}`,n.rating_song&&`노래 ${'★'.repeat(n.rating_song)}`,n.rating_talk&&`소통 ${'★'.repeat(n.rating_talk)}`,n.rating_attend&&`출석 ${'★'.repeat(n.rating_attend)}`].filter(Boolean).join(' · ');
      const imgs = Array.isArray(n.image_urls)&&n.image_urls.length ? `<div class="note-images">${n.image_urls.map(u=>`<img src="${u}" alt="" onclick="window.open('${u}','_blank')">`).join('')}</div>` : '';
      return `<div class="note-card" data-note-id="${n.id}">
        <div class="note-card-header">
          <span class="note-author">${h}시간 시청자${isOwn?' · <span class="own-badge">내 노트</span>':''}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="note-date">${date}</span>
            ${isOwn ? `<button class="note-edit-btn" data-id="${n.id}">수정</button><button class="note-delete-btn" data-id="${n.id}">삭제</button>` : ''}
          </div>
        </div>
        ${imgs}
        ${rStr?`<div class="note-rating">${rStr}</div>`:''}
        ${n.content?`<div class="note-content">${escHtml(n.content)}</div>`:''}
      </div>`;
    }).join('');

    // 삭제 이벤트
    notesList.querySelectorAll('.note-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 노트를 삭제할까요?')) return;
        const id = btn.dataset.id;
        try {
          const res = await fetch(`/api/soop_notes?id=eq.${id}&visitor_fingerprint=eq.${fp}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) throw new Error('삭제 실패');
          await loadNotes();
        } catch(e) { alert(e.message); }
      });
    });

    // 수정 이벤트 - 작성 모달 열고 기존 데이터 채우기
    notesList.querySelectorAll('.note-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const n = notesCache[id];
        if (!n) return;

        // 인증 확인
        const auth = RecapAuth.getAuth();
        const s = auth?.streamers?.find(s => s.slug === slug);
        const watchSec = s?.seconds || n.watch_seconds;

        openWriteS(watchSec, n); // 기존 데이터 전달
      });
    });
  }

  await loadProfile();
  await loadNotes();

  // 인증 상태 버튼
  const auth = RecapAuth.getAuth();
  if (auth?.streamers?.find(s => s.slug === slug)?.seconds >= 7200) {
    document.getElementById('streamer-auth-btn').textContent = '노트 작성';
  }
}

/* ─────────────── 에디터 ─────────────── */
async function initEdit(slug) {
  const loginSection = document.getElementById('login-section');
  const editSection = document.getElementById('edit-section');
  const loginError = document.getElementById('login-error');
  let streamerId = null;

  if (slug) document.getElementById('edit-slug').value = slug;

  const savedToken = sessionStorage.getItem('sn_edit_token');
  const savedSlug = sessionStorage.getItem('sn_edit_slug');
  if (savedToken && savedSlug === slug) await showEdit(slug);

  document.getElementById('login-btn').addEventListener('click', async () => {
    const s = document.getElementById('edit-slug').value.trim() || slug;
    const pw = document.getElementById('edit-password').value;
    loginError.style.display = 'none';
    if (!pw) { loginError.textContent = '비밀번호 입력'; loginError.style.display = 'block'; return; }
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = '로그인 중...';
    try {
      const res = await fetch('/auth/editor', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({slug:s,password:pw}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem('sn_edit_token', data.token);
      sessionStorage.setItem('sn_edit_slug', s);
      await showEdit(s);
    } catch(e) { loginError.textContent = e.message; loginError.style.display = 'block'; btn.disabled = false; btn.textContent = '로그인'; }
  });

  async function showEdit(s) {
    loginSection.style.display = 'none';
    editSection.style.display = 'block';
    document.getElementById('edit-slug-display').textContent = s;
    const rows = await SN.apiGet(`soop_streamers?slug=eq.${s}&select=id,custom`);
    if (!rows.length) { editSection.innerHTML = '<p>스트리머를 찾을 수 없습니다.</p>'; return; }
    streamerId = rows[0].id;
    const custom = rows[0].custom || {};
    if (custom.notice) document.getElementById('custom-notice-input').value = custom.notice;
    if (custom.bg_color) document.getElementById('custom-bg-color').value = custom.bg_color;
    if (custom.banner) document.getElementById('custom-banner').value = custom.banner;

    // 프로필 사진 업로드
    const profileFile = document.getElementById('edit-profile-file');
    const profilePreview = document.getElementById('edit-profile-preview');
    const profileUploadBtn = document.getElementById('edit-profile-upload-btn');
    const profileStatus = document.getElementById('edit-profile-status');
    const uploadLabel = document.querySelector('.upload-label');

    // 현재 프로필 사진 표시
    const curRows = await SN.apiGet(`soop_streamers?slug=eq.${s}&select=profile_image`);
    if (curRows[0]?.profile_image) {
      profilePreview.src = curRows[0].profile_image;
      profilePreview.style.display = 'block';
    }

    uploadLabel.addEventListener('click', () => profileFile.click());
    profileFile.addEventListener('change', () => {
      const file = profileFile.files[0];
      if (!file) return;
      profilePreview.src = URL.createObjectURL(file);
      profilePreview.style.display = 'block';
      profileUploadBtn.style.display = 'inline-block';
    });

    profileUploadBtn.addEventListener('click', async () => {
      const file = profileFile.files[0];
      if (!file) return;
      profileUploadBtn.disabled = true;
      profileUploadBtn.textContent = '업로드 중...';
      profileStatus.style.display = 'none';
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/r2/profile?slug=${s}`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        // DB 업데이트 (cache bust URL에서 key만 저장)
        const cleanUrl = data.url.split('?')[0];
        await SN.apiPatch(`soop_streamers?slug=eq.${s}`, { profile_image: cleanUrl });
        profilePreview.src = data.url;
        profileStatus.textContent = '✅ 업로드 완료';
        profileStatus.style.color = 'var(--green)';
        profileStatus.style.display = 'block';
        profileUploadBtn.style.display = 'none';
      } catch(e) {
        profileStatus.textContent = '❌ ' + e.message;
        profileStatus.style.color = 'var(--red)';
        profileStatus.style.display = 'block';
      } finally {
        profileUploadBtn.disabled = false;
        profileUploadBtn.textContent = '업로드';
      }
    });

    const saveBtn = document.getElementById('save-btn');
    saveBtn.replaceWith(saveBtn.cloneNode(true)); // 중복 이벤트 방지
    document.getElementById('save-btn').addEventListener('click', async () => {
      const newCustom = { notice: document.getElementById('custom-notice-input').value.trim(), bg_color: document.getElementById('custom-bg-color').value, banner: document.getElementById('custom-banner').value.trim() };
      const saveStatus = document.getElementById('save-status');
      const btn = document.getElementById('save-btn');
      btn.disabled = true;
      try {
        await SN.apiPatch(`soop_streamers?id=eq.${streamerId}`, { custom: newCustom });
        saveStatus.textContent = '저장됐어요!'; saveStatus.style.color = 'var(--green)'; saveStatus.style.display = 'block';
        setTimeout(() => saveStatus.style.display = 'none', 2000);
      } catch(e) { saveStatus.textContent = '오류: '+e.message; saveStatus.style.color = 'var(--red)'; saveStatus.style.display = 'block'; }
      finally { btn.disabled = false; }
    });
  }
}

/* ─────────────── 어드민 ─────────────── */
async function initAdmin() {
  const loginEl = document.getElementById('admin-login');
  const panelEl = document.getElementById('admin-panel');
  const loginError = document.getElementById('admin-login-error');

  // 세션 체크
  const token = sessionStorage.getItem('sn_admin_token');
  const expires = Number(sessionStorage.getItem('sn_admin_expires') || 0);
  if (token && expires > Date.now()) {
    loginEl.style.display = 'none';
    panelEl.style.display = 'block';
    await loadAdminData();
  }

  // 로그인
  document.getElementById('admin-login-btn').addEventListener('click', async () => {
    const pw = document.getElementById('admin-pw').value;
    loginError.style.display = 'none';
    if (!pw) return;
    const btn = document.getElementById('admin-login-btn');
    btn.disabled = true; btn.textContent = '확인 중...';
    try {
      const res = await fetch('/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem('sn_admin_token', data.token);
      sessionStorage.setItem('sn_admin_expires', data.expires);
      loginEl.style.display = 'none';
      panelEl.style.display = 'block';
      await loadAdminData();
    } catch(e) {
      loginError.textContent = e.message; loginError.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = '접속'; }
  });

  document.getElementById('admin-pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('admin-login-btn').click();
  });

  // 로그아웃
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('sn_admin_token');
    sessionStorage.removeItem('sn_admin_expires');
    location.reload();
  });

  // 탭 전환
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(t => t.style.display = 'none');
      tab.classList.add('active');
      document.getElementById(`admin-tab-${tab.dataset.tab}`).style.display = 'block';
    });
  });
}

async function loadAdminData() {
  await Promise.all([loadAdminStreamers(), loadAdminNotes(), loadAdminAccounts()]);

  // 스트리머 추가
  document.getElementById('add-streamer-btn').addEventListener('click', async () => {
    const slug = document.getElementById('new-slug').value.trim();
    const name = document.getElementById('new-name').value.trim();
    if (!slug || !name) { alert('slug와 이름을 입력하세요'); return; }
    try {
      await SN.apiPost('soop_streamers', { slug, name, auto_created: false }, 'return=minimal');
      document.getElementById('new-slug').value = '';
      document.getElementById('new-name').value = '';
      await loadAdminStreamers();
    } catch(e) { alert(e.message); }
  });

  // 에디터 계정 발급
  document.getElementById('issue-account-btn').addEventListener('click', async () => {
    const slug = document.getElementById('account-slug').value.trim();
    const pw = document.getElementById('account-pw').value;
    const resultEl = document.getElementById('account-result');
    if (!slug || !pw) { alert('slug와 비밀번호를 입력하세요'); return; }
    try {
      const res = await fetch('/auth/editor/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password: pw, adminToken: sessionStorage.getItem('sn_admin_token') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      resultEl.textContent = `✅ ${slug} 에디터 계정 발급 완료`;
      resultEl.style.color = 'var(--green)';
      resultEl.style.display = 'block';
      document.getElementById('account-pw').value = '';
      await loadAdminAccounts();
    } catch(e) {
      resultEl.textContent = `❌ ${e.message}`;
      resultEl.style.color = 'var(--red)';
      resultEl.style.display = 'block';
    }
  });
}

async function loadAdminStreamers() {
  const list = document.getElementById('admin-streamers-list');
  const streamers = await SN.apiGet('soop_streamers?select=id,slug,name,is_active,auto_created&order=created_at.desc');
  list.innerHTML = streamers.map(s => `
    <div class="admin-row">
      <div class="admin-row-info">
        <a href="/${s.slug}" target="_blank" class="admin-slug">${s.slug}</a>
        <span class="admin-name">${s.name}</span>
        ${s.auto_created ? '<span class="admin-badge">자동생성</span>' : ''}
      </div>
      <div class="admin-row-actions">
        <button class="btn-sm ${s.is_active ? 'btn-warn' : 'btn-accent'}" 
          onclick="toggleStreamer('${s.id}', ${s.is_active})">
          ${s.is_active ? '비활성화' : '활성화'}
        </button>
        <button class="btn-sm btn-danger" onclick="deleteStreamer('${s.id}', '${s.name}')">삭제</button>
      </div>
    </div>
  `).join('');
}

async function loadAdminNotes() {
  const list = document.getElementById('admin-notes-list');
  const notes = await SN.apiGet(
    'soop_notes?select=id,content,watch_seconds,created_at,streamer_id,soop_streamers(name,slug)&order=created_at.desc&limit=50'
  ).catch(() => []);
  list.innerHTML = notes.map(n => {
    const h = Math.floor(n.watch_seconds/3600);
    const name = n.soop_streamers?.name || '-';
    const slug = n.soop_streamers?.slug || '';
    return `<div class="admin-row">
      <div class="admin-row-info">
        <a href="/${slug}" target="_blank" class="admin-slug">${name}</a>
        <span class="admin-name" style="color:var(--text3);">${h}시간 · ${new Date(n.created_at).toLocaleDateString('ko-KR')}</span>
        <span class="admin-note-preview">${(n.content||'').substring(0,40)}${n.content?.length>40?'...':''}</span>
      </div>
      <button class="btn-sm btn-danger" onclick="deleteNote('${n.id}')">삭제</button>
    </div>`;
  }).join('');
}

async function loadAdminAccounts() {
  const list = document.getElementById('admin-accounts-list');
  const tokens = await SN.apiGet(
    'soop_streamer_tokens?select=id,streamer_id,created_at,soop_streamers(name,slug)&order=created_at.desc'
  ).catch(() => []);
  if (!tokens.length) { list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0;">발급된 계정 없음</div>'; return; }
  list.innerHTML = `<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">발급된 에디터 계정 ${tokens.length}개</div>` +
    tokens.map(t => `<div class="admin-row">
      <div class="admin-row-info">
        <span class="admin-slug">${t.soop_streamers?.slug || t.streamer_id}</span>
        <span class="admin-name">${t.soop_streamers?.name || ''}</span>
        <span style="font-size:11px;color:var(--text3);">${new Date(t.created_at).toLocaleDateString('ko-KR')} 발급</span>
      </div>
      <button class="btn-sm btn-danger" onclick="revokeAccount('${t.id}')">취소</button>
    </div>`).join('');
}

// 전역 함수 (onclick에서 호출)
window.toggleStreamer = async (id, isActive) => {
  try {
    await SN.apiPatch(`soop_streamers?id=eq.${id}`, { is_active: !isActive });
    await loadAdminStreamers();
  } catch(e) { alert(e.message); }
};

window.deleteStreamer = async (id, name) => {
  if (!confirm(`"${name}" 스트리머와 모든 노트를 삭제할까요?`)) return;
  try {
    await fetch(`/api/soop_notes?streamer_id=eq.${id}`, { method: 'DELETE' });
    await fetch(`/api/soop_streamers?id=eq.${id}`, { method: 'DELETE' });
    await loadAdminStreamers();
    await loadAdminNotes();
  } catch(e) { alert(e.message); }
};

window.deleteNote = async (id) => {
  if (!confirm('이 노트를 삭제할까요?')) return;
  try {
    await fetch(`/api/soop_notes?id=eq.${id}`, { method: 'DELETE' });
    await loadAdminNotes();
  } catch(e) { alert(e.message); }
};

window.revokeAccount = async (id) => {
  if (!confirm('이 에디터 계정을 취소할까요?')) return;
  try {
    await fetch(`/api/soop_streamer_tokens?id=eq.${id}`, { method: 'DELETE' });
    await loadAdminAccounts();
  } catch(e) { alert(e.message); }
};
