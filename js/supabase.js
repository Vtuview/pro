// Worker(/api/*)가 Supabase 인증 처리 → 클라이언트는 apikey 헤더 불필요

async function apiGet(path) {
  const res = await fetch(`/api/${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API 오류: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body, prefer = '') {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: {
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
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `오류: ${res.status}`);
  }
}

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
