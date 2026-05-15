(async function () {
  const slug = location.pathname.replace(/^\//, '').split('/')[0];
  if (!slug || slug === 'edit') return;

  document.title = `SoopNote — ${slug}`;

  const profileSection = document.getElementById('profile-section');
  const noticeEl = document.getElementById('custom-notice');
  const notesList = document.getElementById('notes-list');
  const overlay = document.getElementById('modal-overlay');
  const stepAuth = document.getElementById('step-auth');
  const stepWrite = document.getElementById('step-write');

  const ratings = { avatar: 0, song: 0, talk: 0, attend: 0 };
  let streamerId = null;
  let selectedFiles = [];

  // 별점 초기화
  document.querySelectorAll('.stars').forEach(el => {
    const key = el.dataset.key;
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      s.dataset.val = i;
      s.addEventListener('click', () => {
        ratings[key] = i;
        el.querySelectorAll('.star').forEach(st => {
          st.classList.toggle('active', Number(st.dataset.val) <= i);
        });
      });
      el.appendChild(s);
    }
  });

  // 모달
  function openStep(id) {
    overlay.style.display = 'flex';
    stepAuth.style.display = 'none';
    stepWrite.style.display = 'none';
    document.getElementById(id).style.display = 'block';
  }
  function closeModal() { overlay.style.display = 'none'; }

  ['modal-close','modal-close2'].forEach(id => {
    document.getElementById(id).addEventListener('click', closeModal);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  // 인증하기 버튼
  document.getElementById('auth-btn').addEventListener('click', () => {
    const auth = RecapAuth.getAuth();
    const s = auth?.streamers?.find(s => s.slug === slug);
    if (s && s.seconds >= 7200) {
      openWriteForm(s.seconds);
    } else if (auth) {
      // 인증됐지만 이 스트리머 없음
      alert('이 스트리머를 2시간 이상 시청한 기록이 없습니다.\n다른 달 리캡을 사용하거나 더 시청 후 시도해주세요.');
    } else {
      openStep('step-auth');
    }
  });

  // 인증
  document.getElementById('verify-btn').addEventListener('click', async () => {
    const url = document.getElementById('share-url-input').value.trim();
    const errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';
    if (!url) { errEl.textContent = 'URL을 입력하세요'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = '확인 중...';

    try {
      const data = await RecapAuth.verifyShareUrl(url);
      const s = data.streamers.find(s => s.slug === slug);
      if (!s) {
        errEl.textContent = '이 스트리머를 2시간 이상 시청한 기록이 없어요.';
        errEl.style.display = 'block';
        return;
      }
      openWriteForm(s.seconds);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = '인증하기';
    }
  });

  async function openWriteForm(watchSec) {
    openStep('step-write');
    const h = Math.floor(watchSec / 3600);
    const m = Math.floor((watchSec % 3600) / 60);
    document.getElementById('write-watch-badge').textContent = `✓ ${h}시간 ${m > 0 ? m+'분' : ''} 시청자`;

    // 기존 노트
    if (streamerId) {
      const fp = await SN.getFingerprint();
      const existing = await SN.apiGet(
        `soop_notes?streamer_id=eq.${streamerId}&visitor_fingerprint=eq.${fp}&select=*&limit=1`
      ).catch(() => []);
      if (existing[0]) {
        document.getElementById('note-content').value = existing[0].content;
        document.getElementById('submit-btn').textContent = '노트 수정';
        ['avatar','song','talk','attend'].forEach(key => {
          const val = existing[0][`rating_${key}`];
          if (val) {
            ratings[key] = val;
            document.querySelector(`.stars[data-key="${key}"]`)
              .querySelectorAll('.star').forEach(st => {
                st.classList.toggle('active', Number(st.dataset.val) <= val);
              });
          }
        });
      }
    }

    // 이미지
    const imagesInput = document.getElementById('note-images');
    const previewEl = document.getElementById('image-preview');
    document.querySelector('.upload-label').onclick = () => imagesInput.click();
    imagesInput.onchange = () => {
      selectedFiles = Array.from(imagesInput.files).slice(0, 2);
      previewEl.innerHTML = selectedFiles.map(f =>
        `<img src="${URL.createObjectURL(f)}" alt="">`
      ).join('');
    };
  }

  // 제출
  document.getElementById('submit-btn').addEventListener('click', async () => {
    const content = document.getElementById('note-content').value.trim();
    const errEl = document.getElementById('write-error');
    errEl.style.display = 'none';

    if (!content && !ratings.avatar) {
      errEl.textContent = '내용 또는 별점을 입력해주세요'; errEl.style.display = 'block'; return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = '등록 중...';

    try {
      const fp = await SN.getFingerprint();
      const watchSec = RecapAuth.getAuth()?.streamers?.find(s => s.slug === slug)?.seconds || 7200;

      // 스트리머 없으면 생성
      if (!streamerId) {
        const soopRes = await fetch(`/soop/profile?slug=${slug}`);
        const soop = soopRes.ok ? await soopRes.json() : {};
        const newRows = await SN.apiPost('soop_streamers', {
          slug,
          name: soop.nick || slug,
          profile_image: soop.profileImage || null,
          auto_created: true,
        }, 'return=representation,resolution=merge-duplicates');
        streamerId = newRows[0].id;
      }

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

      const payload = {
        content, watch_seconds: watchSec, image_urls: imageUrls,
        rating_avatar: ratings.avatar || null, rating_song: ratings.song || null,
        rating_talk: ratings.talk || null, rating_attend: ratings.attend || null,
      };

      const existing = await SN.apiGet(
        `soop_notes?streamer_id=eq.${streamerId}&visitor_fingerprint=eq.${fp}&select=id&limit=1`
      );

      if (existing[0]) {
        await SN.apiPatch(`soop_notes?id=eq.${existing[0].id}`, payload);
      } else {
        await SN.apiPost('soop_notes', { ...payload, streamer_id: streamerId, visitor_fingerprint: fp }, 'return=minimal');
      }

      closeModal();
      await loadNotes();
    } catch (e) {
      errEl.textContent = e.message; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = '노트 등록';
    }
  });

  // 별점 평균 계산
  function calcRating(notes) {
    const keys = ['rating_avatar','rating_song','rating_talk','rating_attend'];
    const result = {};
    keys.forEach(k => {
      const vals = notes.map(n => n[k]).filter(v => v !== null);
      result[k] = vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length) : null;
    });
    return result;
  }

  function starStr(val, total=5) {
    if (!val) return '-';
    const full = Math.round(val);
    return '★'.repeat(full) + '☆'.repeat(total - full);
  }

  function escapeHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 프로필 로드
  async function loadProfile() {
    const [dbRes, soopRes] = await Promise.allSettled([
      SN.apiGet(`soop_streamers?slug=eq.${slug}&select=*`),
      fetch(`/soop/profile?slug=${slug}`).then(r => r.json()),
    ]);

    const db = dbRes.status === 'fulfilled' ? dbRes.value[0] : null;
    const soop = soopRes.status === 'fulfilled' ? soopRes.value : {};

    const name = db?.name || soop.nick || slug;
    document.title = `SoopNote — ${name}`;
    document.getElementById('write-title').textContent = `${name} — 노트 작성`;

    if (db) streamerId = db.id;

    const avatar = db?.profile_image || soop.profileImage ||
      `https://profile.img.sooplive.com/LOGO/${slug.substring(0,2)}/${slug}/${slug}.jpg`;

    // 노트에서 별점 집계
    const notes = db ? await SN.apiGet(
      `soop_notes?streamer_id=eq.${db.id}&select=rating_avatar,rating_song,rating_talk,rating_attend,created_at&order=created_at.desc`
    ).catch(() => []) : [];

    const avgR = calcRating(notes);
    const totalAvg = ['rating_avatar','rating_song','rating_talk','rating_attend']
      .map(k => avgR[k]).filter(v => v !== null);
    const totalVal = totalAvg.length ? (totalAvg.reduce((a,b)=>a+b,0)/totalAvg.length).toFixed(1) : null;

    const lastCast = soop.lastBroadcast
      ? new Date(soop.lastBroadcast).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\. /g,'-').replace('.','')
      : '-';
    const lastReview = notes[0]?.created_at
      ? new Date(notes[0].created_at).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\. /g,'-').replace('.','')
      : '-';

    profileSection.innerHTML = `
      <div class="profile-banner"></div>
      <div class="profile-main">
        <img class="profile-avatar" src="${avatar}" alt="${name}"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22><rect width=%2280%22 height=%2280%22 fill=%22%231e1e26%22/></svg>'">
        <div class="profile-info">
          <div class="profile-name">${name}</div>
          <div class="profile-slug">${slug}</div>
        </div>
      </div>

      <div class="rating-table">
        <div class="rating-table-grid">
          <div class="rating-cell">
            <span class="rating-cell-label">아바타</span>
            <span class="rating-cell-stars">${starStr(avgR.rating_avatar)}</span>
            <span class="rating-cell-val">${avgR.rating_avatar ? avgR.rating_avatar.toFixed(1) : '-'}</span>
          </div>
          <div class="rating-cell">
            <span class="rating-cell-label">소통</span>
            <span class="rating-cell-stars">${starStr(avgR.rating_talk)}</span>
            <span class="rating-cell-val">${avgR.rating_talk ? avgR.rating_talk.toFixed(1) : '-'}</span>
          </div>
          <div class="rating-cell">
            <span class="rating-cell-label">노래</span>
            <span class="rating-cell-stars">${starStr(avgR.rating_song)}</span>
            <span class="rating-cell-val">${avgR.rating_song ? avgR.rating_song.toFixed(1) : '-'}</span>
          </div>
          <div class="rating-cell">
            <span class="rating-cell-label">출석률</span>
            <span class="rating-cell-stars">${starStr(avgR.rating_attend)}</span>
            <span class="rating-cell-val">${avgR.rating_attend ? avgR.rating_attend.toFixed(1) : '-'}</span>
          </div>
        </div>
        <div class="rating-total">
          <span class="rating-total-label">TOTAL</span>
          <span class="rating-total-val">${totalVal ? totalVal + ' / 5.0' : '- / 5.0'}</span>
        </div>
      </div>

      <div class="profile-meta-row">
        <div class="meta-item">
          <div class="meta-label">REVIEW</div>
          <div class="meta-value">${lastReview}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">LAST CAST</div>
          <div class="meta-value">${lastCast}</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">방송시간</div>
          <div class="stat-value">${soop.broadcastHours || 0}h</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">애정자</div>
          <div class="stat-value">${(soop.fanCount||0).toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">팬클럽</div>
          <div class="stat-value">${(soop.fanclubCount||0).toLocaleString()}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">구독</div>
          <div class="stat-value">${(soop.subscribers||0).toLocaleString()}</div>
        </div>
      </div>
    `;

    const custom = db?.custom || {};
    if (custom.notice) { noticeEl.textContent = custom.notice; noticeEl.style.display = 'block'; }
    if (custom.bg_color) document.documentElement.style.setProperty('--bg', custom.bg_color);
  }

  // 노트 목록
  async function loadNotes() {
    if (!streamerId) { notesList.innerHTML = '<div class="empty-notes">아직 노트가 없어요.<br>인증하고 첫 노트를 남겨보세요!</div>'; return; }

    const notes = await SN.apiGet(
      `soop_notes?streamer_id=eq.${streamerId}&select=*&order=created_at.desc`
    ).catch(() => []);

    const fp = await SN.getFingerprint();

    if (!notes.length) {
      notesList.innerHTML = '<div class="empty-notes">아직 노트가 없어요.<br>인증하고 첫 노트를 남겨보세요!</div>';
      return;
    }

    notesList.innerHTML = notes.map(n => {
      const h = Math.floor(n.watch_seconds / 3600);
      const date = new Date(n.created_at).toLocaleDateString('ko-KR');
      const isOwn = n.visitor_fingerprint === fp;
      const ratingStr = [
        n.rating_avatar && `아바타 ${'★'.repeat(n.rating_avatar)}`,
        n.rating_song && `노래 ${'★'.repeat(n.rating_song)}`,
        n.rating_talk && `소통 ${'★'.repeat(n.rating_talk)}`,
        n.rating_attend && `출석 ${'★'.repeat(n.rating_attend)}`,
      ].filter(Boolean).join(' · ');

      const images = Array.isArray(n.image_urls) && n.image_urls.length
        ? `<div class="note-images">${n.image_urls.map(u =>
            `<img src="${u}" alt="" onclick="window.open('${u}','_blank')">`
          ).join('')}</div>`
        : '';

      return `
        <div class="note-card">
          <div class="note-card-header">
            <span class="note-author">${h}시간 시청자${isOwn ? ' · 내 노트' : ''}</span>
            <span class="note-date">${date}</span>
          </div>
          ${ratingStr ? `<div class="note-rating">${ratingStr}</div>` : ''}
          ${n.content ? `<div class="note-content">${escapeHtml(n.content)}</div>` : ''}
          ${images}
        </div>
      `;
    }).join('');
  }

  await loadProfile();
  await loadNotes();

  // 인증 상태 버튼 텍스트
  const auth = RecapAuth.getAuth();
  if (auth?.streamers?.find(s => s.slug === slug)?.seconds >= 7200) {
    document.getElementById('auth-btn').textContent = '노트 작성';
  }
})();
