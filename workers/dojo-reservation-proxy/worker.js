const TARGET_ORIGIN = 'https://dojojapan.pages.dev';

export default {
  fetch(request) {
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, TARGET_ORIGIN);
    return fetch(new Request(targetUrl, request));
  },
};
