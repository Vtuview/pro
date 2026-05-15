// SoopNote 리캡 인증 모듈
// sessionStorage에 인증 상태 저장

const AUTH_KEY = 'sn_recap_auth';

function getAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

function setAuth(data) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

function clearAuth() {
  sessionStorage.removeItem(AUTH_KEY);
}

function isAuthenticated() {
  const auth = getAuth();
  return !!(auth && auth.streamers && auth.streamers.length > 0);
}

// share URL 검증 → Worker 호출
async function verifyShareUrl(shareUrl) {
  const res = await fetch('/auth/recap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '인증 실패');

  // sessionStorage에 저장
  setAuth(data);
  return data;
}

// 특정 slug에 대한 시청시간 반환
function getWatchSeconds(slug) {
  const auth = getAuth();
  if (!auth) return 0;
  const s = auth.streamers.find(s => s.slug === slug);
  return s ? s.seconds : 0;
}

// 2시간 이상 시청한 스트리머 목록
function getEligibleStreamers() {
  const auth = getAuth();
  return auth ? auth.streamers : [];
}

function formatWatchTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}

window.RecapAuth = {
  getAuth, setAuth, clearAuth,
  isAuthenticated,
  verifyShareUrl,
  getWatchSeconds,
  getEligibleStreamers,
  formatWatchTime,
};
