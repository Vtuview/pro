const SUPABASE_URL = 'https://hqhrnzhzywwtmvkyuxeh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxaHJuemh6eXd3dG12a3l1eGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTg1MDgsImV4cCI6MjA5NDM5NDUwOH0.-VyDgr-mmpeV5XIUIre-PVXLOVB6iFY0kP4VxywdyUA';

async function apiGet(path) {
  const res = await fetch(`/api/${path}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
}

async function apiPost(path, body, prefer = '') {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { 'Prefer': prefer } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `오류: ${res.status}`);
  }
  return prefer.includes('return=representation') ? res.json() : res.text();
}

async function apiPatch(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`오류: ${res.status}`);
}

// fingerprint 생성 (기존 soop.info 방식 참고)
async function getFingerprint() {
  const stored = sessionStorage.getItem('sn_fp');
  if (stored) return stored;

  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency,
  ].join('|');

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const fp = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  sessionStorage.setItem('sn_fp', fp);
  return fp;
}

window.SN = { apiGet, apiPost, apiPatch, getFingerprint };
