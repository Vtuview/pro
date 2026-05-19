export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code') || 'none';
    // 일단 fetch 없이 리다이렉트만 테스트
    return Response.redirect(`/?debug_code=${code.substring(0,8)}`, 302);
  } catch(e) {
    return new Response('Error: ' + String(e), { status: 500 });
  }
}
