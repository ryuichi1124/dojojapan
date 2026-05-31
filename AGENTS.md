# DOJO JAPAN Site Rules

この `site/` ディレクトリには、公式サイトだけでなく予約システム、LINE管理、Cloudflare Functions も同居している。依頼範囲を混同しないこと。

詳細な境界は必ず読む。

- `docs/SYSTEM_BOUNDARIES_LINE_RESERVATION_WEBSITE.md`
- `docs/PRODUCTION_ARCHITECTURE_AUDIT_2026-05-31.md`
- `../AGENTS.md`

## 作業前の本番経路確認

`dojo-japan.jp` は公式サイト、LINE、予約APIで配信経路が異なる。作業前に、対象URLがどの経路で返っているかを実測すること。

- 公式サイト通常ページ: `dojojapan` Worker static assets
- LINE/予約/API: `dojo-reservation-proxy` -> `dojojapan.pages.dev`
- `dojojapan.pages.dev`: GitHub main最新ではない古いPages配信元

特に `GitHubにpush済み = 本番反映済み` と判断しない。本番URLを `curl` で確認してから完了報告する。

## 公式サイト表示だけの依頼で触ってよい主な場所

- `index.html`
- `*.html`
- `trainer/*.html`
- `assets/css/style.css`
- `assets/js/main.js`
- `assets/js/analytics.js`
- `assets/js/analytics-instagram-direct.js`

## 公式サイト表示だけの依頼で触らない場所

- `functions/api/line/`
- `functions/api/member/`
- `functions/api/reservations/`
- `dj-line-menu-admin/`
- `dj-member-rsv-8f3k2q/`
- `dj-ops-6271-kuroobi/`
- `migrations/`
- `assets/js/line-menu-admin.js`
- `assets/css/line-menu-admin.css`
- `assets/js/member-reserve.js`
- `assets/css/member-reserve.css`
- `assets/js/staff-reservations.js`
- `assets/css/staff-reservations.css`
- LINE rich menu alias
- Cloudflare D1

## 本番操作

`git push`、Cloudflare deploy、LINE API POST/DELETE、D1 migration/write は、必ず事前確認を取る。
