(async function () {
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

  // 모달 열기/닫기
  function openModal(stepId) {
    overlay.style.display = 'flex';
    [stepAuth, stepSelect, stepWrite].forEach(el => el.style.display = 'none');
    document.getElementById(stepId).style.display = 'block';
  }
  function closeModal() { overlay.style.display = 'none'; }

  ['modal-close','modal-close2','modal-close3'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', closeModal);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  // 인증 상태
  function checkAuthStatus() {
    if (RecapAuth.isAuthenticated()) {
      authBtn.textContent = '노트 작성';
      authStatus.textContent = '✓ 인증됨';
      authStatus.style.display = 'inline';
    }
  }
  checkAuthStatus();

  // 인증하기 버튼
  authBtn.addEventListener('click', () => {
    if (RecapAuth.isAuthenticated()) {
      showStreamerSelect();
    } else {
      openModal('step-auth');
    }
  });

  // Step1: share URL 검증
  document.getElementById('verify-btn').addEventListener('click', async () => {
    const url = document.getElementById('share-url-input').value.trim();
    const errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';
    if (!url) { errEl.textContent = 'URL을 입력해주세요'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('verify-btn');
    btn.disabled = true; btn.textContent = '확인 중...';

    try {
      await RecapAuth.verifyShareUrl(url);
      checkAuthStatus();
      showStreamerSelect();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = '인증하기';
    }
  });

  // Step2: 스트리머 선택
  function showStreamerSelect() {
    const list = document.getElementById('streamer-select-list');
    const streamers = RecapAuth.getEligibleStreamers();

    list.innerHTML = streamers.map(s => {
      const h = Math.floor(s.seconds / 3600);
      const m = Math.floor((s.seconds % 3600) / 60);
      const t = h > 0 ? `${h}시간 ${m > 0 ? m+'분' : ''}` : `${m}분`;
      return `<div class="streamer-select-item" data-slug="${s.slug}" data-name="${s.name}" data-seconds="${s.seconds}">
        <span class="streamer-select-name">${s.name}</span>
        <span class="streamer-select-time">${t} 시청</span>
      </div>`;
    }).join('');

    list.querySelectorAll('.streamer-select-item').forEach(el => {
      el.addEventListener('click', () => {
        selectedStreamer = {
          slug: el.dataset.slug,
          name: el.dataset.name,
          seconds: Number(el.dataset.seconds),
        };
        showWriteForm();
      });
    });

    openModal('step-select');
  }

  // Step3: 작성 폼
  async function showWriteForm() {
    // 별점 초기화
    Object.keys(ratings).forEach(k => ratings[k] = 0);
    document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
    document.getElementById('note-content').value = '';
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('write-error').style.display = 'none';
    document.getElementById('submit-btn').textContent = '노트 등록';
    selectedFiles = [];

    openModal('step-write');
    document.getElementById('write-title').textContent = `${selectedStreamer.name} — 노트 작성`;

    const h = Math.floor(selectedStreamer.seconds / 3600);
    const m = Math.floor((selectedStreamer.seconds % 3600) / 60);
    document.getElementById('write-watch-badge').textContent = `✓ ${h}시간 ${m > 0 ? m+'분' : ''} 시청자`;

    // 기존 노트 불러오기
    try {
      const rows = await SN.apiGet(`soop_streamers?slug=eq.${selectedStreamer.slug}&select=id`);
      if (rows.length) {
        const fp = await SN.getFingerprint();
        const existing = await SN.apiGet(
          `soop_notes?streamer_id=eq.${rows[0].id}&visitor_fingerprint=eq.${fp}&select=*&limit=1`
        );
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
    } catch {}

    // 이미지 업로드
    const imagesInput = document.getElementById('note-images');
    const previewEl = document.getElementById('image-preview');
    const uploadLabel = document.querySelector('.upload-label');

    // 기존 리스너 제거 후 재등록
    const newInput = imagesInput.cloneNode(true);
    imagesInput.parentNode.replaceChild(newInput, imagesInput);
    const newLabel = uploadLabel.cloneNode(true);
    uploadLabel.parentNode.replaceChild(newLabel, uploadLabel);

    newLabel.addEventListener('click', () => newInput.click());
    newInput.addEventListener('change', () => {
      selectedFiles = Array.from(newInput.files).slice(0, 2);
      previewEl.innerHTML = selectedFiles.map(f =>
        `<img src="${URL.createObjectURL(f)}" alt="">`
      ).join('');
    });
  }

  // 제출 (최초 1회만 등록)
  document.getElementById('submit-btn').addEventListener('click', async () => {
    if (!selectedStreamer) return;

    const content = document.getElementById('note-content').value.trim();
    const errEl = document.getElementById('write-error');
    errEl.style.display = 'none';

    if (!content && !ratings.avatar && !ratings.song && !ratings.talk && !ratings.attend) {
      errEl.textContent = '내용 또는 별점을 입력해주세요';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = '등록 중...';

    try {
      const fp = await SN.getFingerprint();
      const slug = selectedStreamer.slug;
      const watchSec = selectedStreamer.seconds;

      // 스트리머: 있으면 기존 id, 없으면 INSERT
      let streamerId;
      const streamerRows = await SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id`);
      if (streamerRows.length) {
        streamerId = streamerRows[0].id;
      } else {
        const soopRes = await fetch(`/soop/profile?slug=${slug}`);
        const soop = soopRes.ok ? await soopRes.json() : {};
        try {
          const created = await SN.apiPost('soop_streamers', {
            slug,
            name: selectedStreamer.name || soop.nick || slug,
            profile_image: soop.profileImage || null,
            auto_created: true,
          }, 'return=representation');
          streamerId = created[0].id;
        } catch {
          // INSERT 실패 (동시 요청으로 이미 생성됨) → 재조회
          const retry = await SN.apiGet(`soop_streamers?slug=eq.${slug}&select=id`);
          if (!retry.length) throw new Error('스트리머 생성 실패');
          streamerId = retry[0].id;
        }
      }

      // 이미지 업로드
      const imageUrls = [];
      const currentFiles = Array.from(
        document.getElementById('note-images')?.files || []
      ).slice(0, 2);

      for (const file of (selectedFiles.length ? selectedFiles : currentFiles)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/r2/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
        imageUrls.push(data.url);
      }

      const payload = {
        content: content || '',
        watch_seconds: watchSec,
        image_urls: imageUrls,
        rating_avatar: ratings.avatar || null,
        rating_song: ratings.song || null,
        rating_talk: ratings.talk || null,
        rating_attend: ratings.attend || null,
      };

      const existing = await SN.apiGet(
        `soop_notes?streamer_id=eq.${streamerId}&visitor_fingerprint=eq.${fp}&select=id&limit=1`
      );

      if (existing[0]) {
        await SN.apiPatch(`soop_notes?id=eq.${existing[0].id}`, payload);
      } else {
        try {
          await SN.apiPost('soop_notes', {
            ...payload, streamer_id: streamerId, visitor_fingerprint: fp,
          }, 'return=minimal');
        } catch {
          // 중복 시 PATCH로 재시도
          const retry = await SN.apiGet(
            `soop_notes?streamer_id=eq.${streamerId}&visitor_fingerprint=eq.${fp}&select=id&limit=1`
          );
          if (retry[0]) await SN.apiPatch(`soop_notes?id=eq.${retry[0].id}`, payload);
          else throw new Error('노트 저장 실패');
        }
      }

      closeModal();
      location.href = `/${slug}`;

    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '노트 등록';
    }
  });

  // 그리드 로드
  try {
    const [streamers, notes] = await Promise.all([
      SN.apiGet('soop_streamers?is_active=eq.true&select=id,slug,name,profile_image&order=created_at.desc'),
      SN.apiGet('soop_notes?select=streamer_id,rating_avatar,rating_song,rating_talk,rating_attend,created_at&order=created_at.desc'),
    ]);

    const statsMap = {};
    notes.forEach(n => {
      if (!statsMap[n.streamer_id]) statsMap[n.streamer_id] = { count: 0, rSum: 0, rCount: 0, latest: n.created_at };
      const stat = statsMap[n.streamer_id];
      stat.count++;
      if (n.created_at > stat.latest) stat.latest = n.created_at;
      const vals = [n.rating_avatar, n.rating_song, n.rating_talk, n.rating_attend].filter(v => v !== null);
      if (vals.length) { stat.rSum += vals.reduce((a,b)=>a+b,0)/vals.length; stat.rCount++; }
    });

    if (!streamers.length) {
      grid.innerHTML = '<div class="loading">아직 등록된 스트리머가 없어요.<br>인증하고 첫 노트를 남겨보세요!</div>';
      return;
    }

    streamers.sort((a, b) => {
      const al = statsMap[a.id]?.latest || a.created_at;
      const bl = statsMap[b.id]?.latest || b.created_at;
      return bl > al ? 1 : -1;
    });

    grid.innerHTML = streamers.map(s => {
      const stat = statsMap[s.id] || {};
      const avg = stat.rCount ? (stat.rSum / stat.rCount).toFixed(1) : null;
      const stars = avg ? '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg)) : '';
      const avatar = s.profile_image ||
        `https://profile.img.sooplive.com/LOGO/${s.slug.substring(0,2)}/${s.slug}/${s.slug}.jpg`;
      return `
        <a href="/${s.slug}" class="streamer-card">
          <img class="streamer-card-avatar" src="${avatar}" alt="${s.name}"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22%231e1e26%22/></svg>'">
          <div class="streamer-card-name">${s.name}</div>
          ${avg ? `<div class="streamer-card-rating">${stars} <span style="color:var(--text2);font-size:11px;">${avg}</span></div>` : ''}
          <div class="streamer-card-meta">${s.slug}</div>
          <span class="streamer-card-note-count">노트 ${stat.count || 0}개</span>
        </a>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading">오류: ${e.message}</div>`;
  }
})();
