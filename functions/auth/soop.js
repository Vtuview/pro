// GET /auth/soop → SOOP OAuth 로그인 페이지로 리다이렉트

const CLIENT_ID = 'a34f99ffbc82fcaabf6f8684bfdad71a';
const REDIRECT_URI = 'https://soopnote.pages.dev/auth/callback';
const AUTH_URL = 'https://openapi.sooplive.com/auth/code';

export async function onRequest() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
  });
  return Response.redirect(`${AUTH_URL}?${params.toString()}`, 302);
}
