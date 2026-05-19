export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code') || 'none';
    return Response.redirect(`https://soopnote.pages.dev/?debug_code=${code.substring(0,8)}`, 302);
  } catch(e) {
    return new Response('Error: ' + String(e), { status: 500 });
  }
}
