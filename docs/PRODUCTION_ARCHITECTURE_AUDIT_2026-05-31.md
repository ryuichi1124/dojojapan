# DOJO JAPAN 本番構成監査 2026-05-31

この文書は、`dojo-japan.jp` で発生した公式サイト・LINE・予約システムの混線を二度と起こさないための本番構成メモです。

最終確認日: 2026-05-31  
対象repo: `/Users/matsuhisaryuichi/Desktop/dojo-japan-project/site`  
GitHub repo: `ryuichi1124/dojojapan`

## 結論

`dojo-japan.jp` は単一システムではありません。同じドメイン配下に、少なくとも次の3系統が混在しています。

| 系統 | 主な用途 | 現在の本番経路 | GitHub pushだけで反映されるか |
|---|---|---|---|
| 公式サイト | TOP、下層ページ、公式サイト内Instagram/BOOK | `dojojapan` Worker static assets | 反映される |
| 予約・LINE API | `/api/line*`, `/api/member*`, `/api/reservations*`, `/api/chatbot*` | `dojo-reservation-proxy` -> `dojojapan.pages.dev` | 反映されない可能性が高い |
| 古いPages | `dojojapan.pages.dev` | Git接続なしの古いPages配信元 | GitHub mainとは同期していない |

重要: Cloudflare上に同名の `dojojapan` が Worker と Pages の両方で存在する。名前だけで判断しない。

## 本番実測結果

2026-05-31 に `curl` で実測した結果です。

### 公式サイトTOP

URL:

```text
https://dojo-japan.jp/
```

確認結果:

```text
id="dojoChatbotToggle"
assets/js/analytics.js?v=20260531-no-instagram-handling
assets/js/chatbot-site.js?v=20260531-toggle-compat
```

判定:

```text
公式サイトTOPは新しい dojojapan Worker 側が返している。
Instagramを押してbotが開く古いanalytics.jsは、本番TOPでは読まれていない。
```

### 公式サイトFLOW

URL:

```text
https://dojo-japan.jp/flow
```

確認結果:

```text
id="dojoChatbotToggle"
assets/js/chatbot-site.js?v=20260531-toggle-compat
assets/js/analytics.js?v=20260531-no-instagram-handling
```

判定:

```text
FLOWも公式サイトWorker側が返している。
```

### analytics.js

URL:

```text
https://dojo-japan.jp/assets/js/analytics.js?v=20260531-no-instagram-handling
```

確認結果:

```text
instagram_click なし
dojo_japan なし
chatbotToggle なし
```

残っているもの:

```text
cta_trial_click
gtag
```

判定:

```text
公式サイトのInstagramリンクをbot起動させる記述は削除済み。
```

### chatbot-site.js

URL:

```text
https://dojo-japan.jp/assets/js/chatbot-site.js?v=20260531-toggle-compat
```

確認結果:

```js
const toggle = document.getElementById('dojoChatbotToggle') || document.getElementById('chatbotToggle');
if (!toggle || !panel || !msgList || !actions || !statusEl) return;
```

判定:

```text
公式サイトのBOOKは新旧ID両対応のJSを読む。
古いproxy側の assets/js/chatbot.js* ルートを踏まないための回避策として chatbot-site.js を使用中。
```

### 古いPages

URL:

```text
https://dojojapan.pages.dev/
```

確認結果:

```text
id="chatbotToggle"
assets/js/analytics.js?v=202605160100
assets/js/chatbot.js?v=202605301345
```

判定:

```text
dojojapan.pages.dev は古い公式サイトを返している。
GitHub main最新ではない。
公式サイト本番の配信元として使ってはいけない。
```

### LINE webhook

URL:

```text
https://dojo-japan.jp/api/line/webhook
https://dojojapan.pages.dev/api/line/webhook
```

現在の本番応答:

```json
{"ok":true,"service":"dojo-japan-line-webhook"}
```

GitHub main の現在の期待応答:

```json
{
  "ok": true,
  "service": "dojo-japan-line-webhook",
  "build": "2026-05-31-line-name-keyboard-v1",
  "namePromptPreview": "お名前をフルネームで入力してください。\n\n画面左下のキーボードアイコンをタップして、トークにお名前を入力してください。\n例: 山田 太郎"
}
```

判定:

```text
LINE webhook本番はGitHub main最新ではない。
LINEの名前入力文言が出ない原因は、コードではなく本番実行元の未更新。
```

### 公式Worker直URL

URL:

```text
https://dojojapan.ichi-design1111.workers.dev/api/line/webhook
```

確認結果:

```text
404
```

判定:

```text
dojojapan Worker は静的公式サイトを配信している。
LINE/API functions はこのWorker直URLには載っていない。
```

### WebチャットAPI

URL:

```text
https://dojo-japan.jp/api/chatbot/availability
```

確認結果:

```json
{"ok":true,"people":1,"dates":[...]}
```

判定:

```text
Webチャット用 availability API は本番で動作している。
経路は dojo-reservation-proxy -> dojojapan.pages.dev。
RESERVATIONS_DB を読んでいる。
```

### 会員API / 予約管理API

URL:

```text
https://dojo-japan.jp/api/member
https://dojo-japan.jp/api/reservations
```

確認結果:

```json
{"ok":false,"error":"UNAUTHORIZED"}
```

判定:

```text
APIは到達している。認証なしなのでUNAUTHORIZEDは正常。
```

## Cloudflareルート

repo上の `wrangler.reservation-proxy.jsonc` で管理されている予約proxyルート:

```text
dojo-japan.jp/dj-member-rsv-8f3k2q*
dojo-japan.jp/dj-line-menu-admin*
dojo-japan.jp/dj-ops-6271-kuroobi*
dojo-japan.jp/api/reservations*
dojo-japan.jp/api/member*
dojo-japan.jp/api/line*
dojo-japan.jp/api/chatbot*
dojo-japan.jp/assets/css/member-reserve.css
dojo-japan.jp/assets/js/member-reserve.js
dojo-japan.jp/assets/css/line-menu-admin.css
dojo-japan.jp/assets/js/line-menu-admin.js
dojo-japan.jp/assets/css/staff-reservations.css
dojo-japan.jp/assets/js/staff-reservations.js
dojo-japan.jp/assets/line/dojo-member-richmenu.jpg
```

削除済み、復活禁止:

```text
dojo-japan.jp/*
dojo-japan.jp/assets/js/chatbot.js*
```

理由:

```text
dojo-japan.jp/* は公式サイト全体をproxyが横取りする。
assets/js/chatbot.js* は公式サイトのBOOKと古いJSのID不一致を起こす。
```

## dojojapan Worker

設定ファイル:

```text
wrangler.jsonc
```

重要設定:

```json
{
  "name": "dojojapan",
  "assets": { "directory": "." },
  "kv_namespaces": [{ "binding": "LINE_BOT_SESSIONS" }],
  "d1_databases": [{ "binding": "RESERVATIONS_DB" }]
}
```

現状:

```text
公式サイトの静的HTML/CSS/JSを配信する。
本番 dojo-japan.jp のTOPと通常ページはここを見る。
ただし /api/line/webhook はWorker直URLで404のため、API functionsはこのWorkerには載っていない。
```

## dojo-reservation-proxy Worker

設定ファイル:

```text
wrangler.reservation-proxy.jsonc
workers/dojo-reservation-proxy/worker.js
```

実装:

```js
const TARGET_ORIGIN = 'https://dojojapan.pages.dev';
```

意味:

```text
予約・LINE・API系の特定パスを受け、dojojapan.pages.dev にfetchして返すproxy。
```

注意:

```text
proxy先の dojojapan.pages.dev がGitHub最新でない場合、/api/line* や /api/reservations* も古いコードで動く。
```

## LINE関連

対象ファイル:

```text
functions/api/line/webhook.js
functions/api/line/rich-menu-sync.js
dj-line-menu-admin/index.html
assets/js/line-menu-admin.js
assets/css/line-menu-admin.css
assets/line/dojo-member-richmenu.jpg
```

binding:

```text
LINE_BOT_SESSIONS
RESERVATIONS_DB
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
RESERVATION_ADMIN_USER
RESERVATION_ADMIN_PASSWORD
```

現在のLINE rich menu alias:

```text
dojo-member -> richmenu-cf3ccd65bdde723cc874710eecce02d4
dojo-guest  -> richmenu-2ce374c0443f77fd4729a0790e963691
```

禁止:

```text
公式サイト表示の修正でLINE rich menu aliasを触らない。
LINE API POST/DELETEは必ず事前確認する。
```

LINE webhookの現状問題:

```text
GitHub mainの functions/api/line/webhook.js は修正済み。
しかし本番 /api/line/webhook は build fingerprint を返していない。
したがって本番LINE応答はGitHub main最新ではない。
```

## 予約システム

画面:

```text
/dj-member-rsv-8f3k2q/
/dj-ops-6271-kuroobi/
```

API:

```text
/api/member*
/api/reservations*
```

主なファイル:

```text
dj-member-rsv-8f3k2q/index.html
dj-ops-6271-kuroobi/index.html
assets/js/member-reserve.js
assets/css/member-reserve.css
assets/js/staff-reservations.js
assets/css/staff-reservations.css
functions/api/member/[[path]].js
functions/api/reservations/[[path]].js
migrations/*.sql
```

DB:

```text
Cloudflare D1: reservations-db
binding: RESERVATIONS_DB
```

禁止:

```text
公式サイト修正中にD1 migration/writeをしない。
予約APIの変更は公式サイト修正とは別タスクとして扱う。
```

## 公式サイト

対象:

```text
index.html
*.html
trainer/*.html
assets/css/style.css
assets/js/main.js
assets/js/analytics.js
assets/js/chatbot-site.js
assets/js/chatbot.js
```

現在のBOOK:

```text
HTMLは dojoChatbotToggle を使用。
trainer/*.html の一部は chatbotToggle を使用。
chatbot-site.js は両方に対応。
```

現在のInstagram:

```text
analytics.js から Instagram / DM / chatbotToggle 起動処理は削除済み。
InstagramリンクはInstagramへ直接遷移する。
```

## 作業前の必須確認

作業開始前に必ず次を確認する。

```text
対象分類:
  公式サイト表示 / 公式サイトWebチャット / LINE webhook / LINE rich menu / 予約システム / Cloudflare配信

触るファイル:

触る外部状態:
  GitHub push / Cloudflare deploy / LINE API / D1 / KV / なし

触らない範囲:

本番反映経路:
  dojojapan Worker / dojo-reservation-proxy -> dojojapan.pages.dev / LINE API / D1
```

## 変更前の実測コマンド

公式サイト:

```sh
curl -sS -L 'https://dojo-japan.jp/' | rg -n 'analytics\.js\?v=|chatbot-site\.js\?v=|dojoChatbotToggle|chatbotToggle'
curl -sS -L 'https://dojo-japan.jp/assets/js/analytics.js?v=20260531-no-instagram-handling' | rg -n 'instagram_click|dojo_japan|chatbotToggle'
```

古いPages確認:

```sh
curl -sS -L 'https://dojojapan.pages.dev/' | rg -n 'analytics\.js\?v=|chatbot\.js\?v=|chatbotToggle'
```

LINE webhook:

```sh
curl -sS -L 'https://dojo-japan.jp/api/line/webhook'
curl -sS -L 'https://dojojapan.pages.dev/api/line/webhook'
```

予約/API:

```sh
curl -sS -L 'https://dojo-japan.jp/api/chatbot/availability'
curl -sS -L 'https://dojo-japan.jp/api/member'
curl -sS -L 'https://dojo-japan.jp/api/reservations'
```

## GO / NO-GO基準

### 公式サイト修正のGO条件

```text
dojo-japan.jp がGitHub最新のHTML/JSを返す。
dojojapan.pages.dev の古いHTMLに依存しない。
analytics.js にInstagram bot起動処理がない。
BOOKは chatbot-site.js を読む。
```

### LINE webhook修正のGO条件

```text
https://dojo-japan.jp/api/line/webhook が GitHub main と同じ build を返す。
LINEの実メッセージで新文言が出る。
既存セッションの場合は「キャンセル」から再開して確認する。
```

現時点のLINE webhookは NO-GO:

```text
GitHub mainに修正はあるが、本番 /api/line/webhook は build を返していない。
```

### 予約システム修正のGO条件

```text
該当画面が期待assetを読む。
APIが認証なしでUNAUTHORIZEDを返す。
認証後の実動作はテストユーザーまたは管理者許可がある時だけ行う。
```

## 今回の事故原因

1. GitHub main と本番実行元が同じだと誤認した。
2. `dojo-japan.jp/*` の広すぎるproxy routeが公式サイトを横取りしていた。
3. `assets/js/chatbot.js*` がproxyに残り、公式サイトHTMLと古いJSが不一致になった。
4. LINE webhook が `dojojapan.pages.dev` 側で動いている可能性を、先に検証しなかった。

## 今後の禁止事項

```text
GitHubにpush済み = 本番反映済み、と言わない。
Cloudflareのアプリ名だけで配信元を判断しない。
公式サイト作業でLINE rich menuやD1を触らない。
LINE作業で公式サイト全体routeを触らない。
本番URLのcurl確認なしに「直った」と言わない。
```

