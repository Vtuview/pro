(async function() {
  const slug = location.pathname.replace('/edit/', '').split('/')[0];

  const loginSection = document.getElementById('login-section');
  const editSection = document.getElementById('edit-section');
  const loginError = document.getElementById('login-error');

  let streamerId = null;

  // 세션 체크
  const savedToken = sessionStorage.getItem('sn_edit_token');
  const savedSlug = sessionStorage.getItem('sn_edit_slug');

  if (savedToken && savedSlug === slug) {
    await showEditPanel(slug);
  }

  // 로그인
  document.getElementById('login-btn').addEventListener('click', async () => {
    const inputSlug = document.getElementById('edit-slug').value.trim() || slug;
    const password = document.getElementById('edit-password').value;
    loginError.style.display = 'none';

    if (!password) { loginError.textContent = '비밀번호를 입력하세요'; loginError.style.display = 'block'; return; }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = '로그인 중...';

    try {
      const res = await fetch('/auth/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: inputSlug, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sessionStorage.setItem('sn_edit_token', data.token);
      sessionStorage.setItem('sn_edit_slug', inputSlug);
      await showEditPanel(inputSlug);
    } catch (e) {
      loginError.textContent = e.message;
      loginError.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '로그인';
    }
  });

  async function showEditPanel(s) {
    loginSection.style.display = 'none';
    editSection.style.display = 'block';
    document.getElementById('edit-slug-display').textContent = s;

    // 현재 설정 로드
    const rows = await SN.apiGet(`soop_streamers?slug=eq.${s}&select=id,custom`);
    if (!rows.length) { editSection.innerHTML = '<p>스트리머를 찾을 수 없습니다.</p>'; return; }

    streamerId = rows[0].id;
    const custom = rows[0].custom || {};

    if (custom.notice) document.getElementById('custom-notice-input').value = custom.notice;
    if (custom.bg_color) document.getElementById('custom-bg-color').value = custom.bg_color;
    if (custom.banner) document.getElementById('custom-banner').value = custom.banner;

    // 저장
    document.getElementById('save-btn').addEventListener('click', async () => {
      const newCustom = {
        notice: document.getElementById('custom-notice-input').value.trim(),
        bg_color: document.getElementById('custom-bg-color').value,
        banner: document.getElementById('custom-banner').value.trim(),
      };

      const saveStatus = document.getElementById('save-status');
      const btn = document.getElementById('save-btn');
      btn.disabled = true;

      try {
        await SN.apiPatch(`soop_streamers?id=eq.${streamerId}`, { custom: newCustom });
        saveStatus.textContent = '저장됐어요!';
        saveStatus.style.display = 'block';
        setTimeout(() => { saveStatus.style.display = 'none'; }, 2000);
      } catch (e) {
        saveStatus.textContent = '오류: ' + e.message;
        saveStatus.style.color = 'var(--red)';
        saveStatus.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
