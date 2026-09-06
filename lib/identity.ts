export function workspaceOwner(request: Request) {
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return 'local-presentation';
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) throw new Error('برای فضای خصوصی ارائه، وارد حساب خود شوید.');
  return id;
}
