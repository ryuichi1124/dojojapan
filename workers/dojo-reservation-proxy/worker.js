const TARGET_ORIGIN = 'https://dojojapan.pages.dev';
const NO_STORE_ASSETS = new Set([
  '/assets/css/member-reserve.css',
  '/assets/js/member-reserve.js',
  '/assets/css/line-menu-admin.css',
  '/assets/js/line-menu-admin.js',
  '/assets/css/staff-reservations.css',
  '/assets/js/staff-reservations.js',
  '/assets/line/dojo-member-richmenu.jpg',
]);

export default {
  async fetch(request) {
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, TARGET_ORIGIN);
    const targetRequest = new Request(targetUrl, request);
    const response = await fetch(targetRequest, NO_STORE_ASSETS.has(sourceUrl.pathname) ? {
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    } : undefined);

    if (!NO_STORE_ASSETS.has(sourceUrl.pathname)) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
