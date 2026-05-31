# DŌJŌ JAPAN システム構成設計図

作成日: 2026-05-31 JST

## 目的

このメモは、`dojo-japan.jp` 公式サイト、予約管理、会員予約、LINE予約、LINEリッチメニュー、Cloudflare / GitHub / D1 の境界を明確にするための設計図である。

今後の作業では、最初に「公式サイトの変更」なのか「予約・LINE系の変更」なのかを切り分けてから触る。

## 全体像

```text
GitHub: ryuichi1124/dojojapan
  |
  | main push
  v
Cloudflare Pages project: dojojapan
  |
  | static HTML/CSS/JS + Pages Functions
  v
dojojapan.pages.dev
  ^
  |
Cloudflare Worker: dojo-reservation-proxy
  |
  | dojo-japan.jp/* を dojojapan.pages.dev へプロキシ
  v
https://dojo-japan.jp/

Cloudflare D1: reservations-db
  ^        ^          ^
  |        |          |
Admin API Member API LINE webhook / chatbot availability
```

## 作業場所とソース

| 項目 | 内容 |
|---|---|
| ローカル作業場所 | `/Users/matsuhisaryuichi/Desktop/dojo-japan-project/site` |
| GitHub remote | `https://github.com/ryuichi1124/dojojapan.git` |
| 本番ドメイン | `https://dojo-japan.jp/` |
| Pages配信元 | `https://dojojapan.pages.dev/` |
| Cloudflare Pages project | `dojojapan` |
| D1 database | `reservations-db` |
| KV binding | `LINE_BOT_SESSIONS` |
| 予約プロキシWorker | `dojo-reservation-proxy` |

## 重要な運用ルール

| 依頼内容 | まず見る場所 | 主な変更対象 |
|---|---|---|
| 公式サイトの表示、リンク、SEO、コピー、CTA、ページ挙動 | GitHub管理の静的サイト | root HTML、`assets/css/style.css`、`assets/js/main.js`、`assets/js/analytics.js` |
| 管理画面、会員予約、予約ルール、D1データ | Cloudflare Pages Functions + D1 | `functions/api/reservations/`、`functions/api/member/`、`assets/js/staff-reservations.js`、`assets/js/member-reserve.js`、`migrations/` |
| LINE bot、LINE仮予約、LINE webhook | Cloudflare Pages Functions + LINE Messaging API + D1/KV | `functions/api/line/webhook.js`、`assets/js/staff-reservations.js` |
| LINEリッチメニュー | Cloudflare Pages Functions + LINE Rich Menu API | `functions/api/line/rich-menu-sync.js`、`dj-line-menu-admin/`、`assets/js/line-menu-admin.js` |
| チャットボット | 公式サイトJS + Pages Functions | `assets/js/chatbot.js`、`functions/api/chatbot/availability.js`、`functions/api/chatbot/copy.js` |

## 1. 公式サイト

### 役割

一般ユーザー向けの静的サイト。DOJO JAPANの情報、料金、トレーナー、施設、アクセス、FAQ、体験導線を提供する。

### 主なページ

| パス | ファイル | 内容 |
|---|---|---|
| `/` | `index.html` | TOP、ヒーロー、トレーナー、料金、体験CTA、アクセス、チャットボット |
| `/concept` | `concept.html` | コンセプト |
| `/trainers` | `trainers.html` | トレーナー一覧 |
| `/trainer/yahiro` など | `trainer/*.html` | トレーナー詳細 |
| `/gym` | `gym.html` | 設備 |
| `/pricing` | `pricing.html` | 料金 |
| `/flow` | `flow.html` | 利用の流れ |
| `/faq` | `faq.html` | FAQ |
| `/access` | `access.html` | アクセス |
| `/terms` | `terms.html` | 利用規約 |
| `/press` | `press.html` | 報道関係者向け |

### 主要アセット

| ファイル | 役割 |
|---|---|
| `assets/css/style.css` | 公式サイト共通CSS |
| `assets/js/main.js` | TOP/通常ページのUI挙動 |
| `assets/js/analytics.js` | GA4イベント計測 |
| `assets/js/chatbot.js` | 体験・ビジター・入会相談チャットボット |
| `assets/img/` | 画像 |
| `assets/movies/` | 動画 |
| `sitemap.xml` / `robots.txt` | SEO |
| `_headers` | Cloudflare Pages headers |

### 注意点

- 公式サイトはビルド不要の静的HTML/CSS/JS。
- `analytics.js` は計測だけに留める。ページ上のInstagramリンクをチャットボットへ横取りしない。
- `index.html` のチャットボットJSは遅延ロードされる。
- `style.css` と各JSはクエリパラメータでキャッシュ対策している箇所がある。

## 2. 予約管理システム

### 入口

| URL | ファイル | 役割 |
|---|---|---|
| `/dj-ops-6271-kuroobi/` | `dj-ops-6271-kuroobi/index.html` | スタッフ管理画面 |
| `/api/reservations/*` | `functions/api/reservations/[[path]].js` | スタッフ向け予約API |
| `assets/js/staff-reservations.js` | JS | 管理画面ロジック |
| `assets/css/staff-reservations.css` | CSS | 管理画面スタイル |

### 認証

- 管理画面/APIは `RESERVATION_ADMIN_USER` と `RESERVATION_ADMIN_PASSWORD` で保護。
- 認証失敗は `LINE_BOT_SESSIONS` KV を使ってIP単位で短時間ロックする実装がある。
- 管理画面配下は `_headers` で `no-store`、`noindex`、CSPを設定。

### 主なAPI

`functions/api/reservations/[[path]].js` のルーティング:

| Method / path | 役割 |
|---|---|
| `GET /api/reservations/bootstrap` | 管理画面初期データ |
| `GET /api/reservations/member-history` | 会員履歴 |
| `POST /api/reservations/member` | 会員作成/更新 |
| `POST /api/reservations/member-status` | 会員ステータス変更 |
| `POST /api/reservations/member-delete` | 会員削除扱い |
| `POST /api/reservations/member-access` | 会員予約アクセス情報保存 |
| `POST /api/reservations/member-pin-reset` | PINリセット |
| `POST /api/reservations/book` | スタッフ代理予約 |
| `POST /api/reservations/cancel` | 予約キャンセル |
| `POST /api/reservations/line-booking-approve` | LINE仮予約承認 |
| `POST /api/reservations/line-booking-cancel` | LINE仮予約キャンセル |
| `POST /api/reservations/memo` | 枠メモ保存 |
| `POST /api/reservations/business-closure` | 営業不可設定 |
| `POST /api/reservations/business-closure-delete` | 営業不可削除 |
| `POST /api/reservations/trainer-override` | 枠担当者上書き |
| `POST /api/reservations/trainer-override-delete` | 枠担当者上書き削除 |

### 予約ルール

- 1枠6名。
- session id形式は `YYYY-MM-DD-HH`。
- 通常枠は7:00から18:00終了まで。
- 毎週日曜日は予約不可。
- 第一土曜日午前は予約不可。
- 営業不可設定で午前・午後・全日を塞げる。
- 通常予約は開始1時間前まで。
- パーソナル予約は開始6時間前まで。
- 会員画面からのキャンセル/変更は期限チェックあり。
- パーソナル予約は `capacity_units = 6` として枠を満席扱いにする。
- 正会員は月間予約無制限。準会員は月2/月4/月8。
- 同伴/紹介などの枠は `quota_exempt` 系カラムで月間消費から除外できる。

## 3. 会員予約システム

### 入口

| URL | ファイル | 役割 |
|---|---|---|
| `/dj-member-rsv-8f3k2q/` | `dj-member-rsv-8f3k2q/index.html` | 会員予約画面 |
| `/api/member/*` | `functions/api/member/[[path]].js` | 会員向けAPI |
| `assets/js/member-reserve.js` | JS | 会員予約UI |
| `assets/css/member-reserve.css` | CSS | 会員予約スタイル |

### 認証

- 会員コード + PIN、または `booking_token` + PIN。
- ログイン成功時に `member_sessions` へセッションハッシュを保存。
- Cookie名は `dojo_member_session`。
- Cookieは `Secure; HttpOnly; SameSite=Lax`。
- LINEブラウザではログイン保持しやすいようにlocalStorage/sessionStorageも併用。
- PIN失敗回数が一定数を超えると一時ロック。

### 主なAPI

`functions/api/member/[[path]].js` のルーティング:

| Method / path | 役割 |
|---|---|
| `POST /api/member/auth/login` | 会員ログイン |
| `POST /api/member/auth/logout` | ログアウト |
| `GET /api/member/me` | 自分の会員情報 |
| `GET /api/member/reservations` | 自分の予約一覧 |
| `GET /api/member/reservations/history` | 自分の予約履歴 |
| `GET /api/member/availability` | 空き状況 |
| `POST /api/member/profile` | プロフィール更新 |
| `POST /api/member/reservations/book` | 予約 |
| `POST /api/member/reservations/cancel` | キャンセル |
| `POST /api/member/reservations/change` | 変更 |

### UI機能

- 「予約状況・キャンセル」と「新規予約」のタブ。
- 週間スロット表示。
- 日付タブ。
- パーソナル予約。
- 予約変更。
- 当日キャンセル不可案内。
- 紹介/同伴予約モード。
- 月間利用履歴。
- 会員プロフィール更新。

## 4. LINE予約 / LINE bot

### 入口

| URL | ファイル | 役割 |
|---|---|---|
| `/api/line/webhook` | `functions/api/line/webhook.js` | LINE Messaging API webhook |
| `/dj-line-menu-admin/` | `dj-line-menu-admin/index.html` | LINEリッチメニュー管理 |
| `/api/line/rich-menu-sync` | `functions/api/line/rich-menu-sync.js` | LINEリッチメニュー同期API |
| `assets/js/line-menu-admin.js` | JS | リッチメニュー管理UI |
| `assets/line/dojo-member-richmenu.jpg` | 画像 | リッチメニュー画像 |

### LINE webhook

`functions/api/line/webhook.js` の責務:

- LINE署名検証: `LINE_CHANNEL_SECRET`。
- LINE返信: `LINE_CHANNEL_ACCESS_TOKEN`。
- 会話状態保存: `LINE_BOT_SESSIONS` KV。
- 空き状況参照: `RESERVATIONS_DB`。
- LINE仮予約保存: `line_booking_requests`。
- 管理者通知メール: `DOJO_MAIL_SECRET` と `DOJO_MAIL_ENDPOINT`。
- LINEプロフィール取得: LINE Profile API。

### LINE仮予約フロー

```text
ユーザーがLINEで希望入力
  -> webhookが会話状態をKVに保存
  -> 空き候補をD1から取得
  -> 希望日時/人数/レンタル等を収集
  -> line_booking_requests に pending 保存
  -> メールでスタッフ通知
  -> 管理画面で承認またはキャンセル
  -> 承認時に reservations へ本予約作成
```

### リッチメニュー

`functions/api/line/rich-menu-sync.js` の責務:

- 現在のLINEリッチメニュー取得。
- 会員タブ `dojo-member` と非会員タブ `dojo-guest` の作成。
- リッチメニュー画像アップロード。
- alias作成/更新。
- 管理画面と同じ `RESERVATION_ADMIN_USER/PASSWORD` で保護。
- 認証失敗は `LINE_BOT_SESSIONS` でレート制限。

デフォルトリンク:

| メニュー | 主なリンク |
|---|---|
| 会員タブ | 会員予約画面、予約確認、Instagram、公式サイト |
| 非会員タブ | 初回体験、ビジター利用、Instagram、公式サイト |

## 5. サイト内チャットボット

### 入口

| ファイル | 役割 |
|---|---|
| `assets/js/chatbot.js` | 多言語チャットボット本体 |
| `functions/api/chatbot/availability.js` | 空き状況API |
| `functions/api/chatbot/copy.js` | コピー/問い合わせ通知API |

### 機能

- 対応言語: 日本語、英語、韓国語、中国語。
- 体験、入会、見学、ビジター案内。
- 空き状況は `RESERVATIONS_DB` から取得。
- 最終的な連絡先はInstagram DM。
- 送信用テキストを生成してコピーさせる。
- コピーイベントをメール通知できる。

### 注意点

- 公式サイト上のInstagramリンクは直接Instagramへ遷移させる。
- チャットボット内の「Instagram DMを開く」だけが、チャットボット完了イベントとして扱われる。

## 6. Cloudflare構成

### Pages

| 項目 | 内容 |
|---|---|
| Project | `dojojapan` |
| 配信元 | `dojojapan.pages.dev` |
| 構成 | 静的HTML/CSS/JS + Pages Functions |
| build command | なし |
| build output | `.` |
| config | `wrangler.jsonc` |

`wrangler.jsonc` の主な内容:

- `name`: `dojojapan`
- `pages_build_output_dir`: `.`
- `assets.directory`: `.`
- D1 binding: `RESERVATIONS_DB` -> `reservations-db`
- KV binding: `LINE_BOT_SESSIONS`

### Worker proxy

`wrangler.reservation-proxy.jsonc` と `workers/dojo-reservation-proxy/worker.js`:

- Worker名: `dojo-reservation-proxy`
- `dojo-japan.jp/*` を `https://dojojapan.pages.dev` へプロキシ。
- 予約系APIや管理画面も同じドメイン配下で動かすための入口になっている。

### Headers

`_headers`:

- 全体に基本セキュリティヘッダー。
- 管理画面、会員予約画面、LINEメニュー管理画面は `no-store` / `noindex` / CSP付き。

### 静的アセット除外

`.assetsignore`:

- `.dev.vars`、`.wrangler/`、`functions/`、`migrations/`、`node_modules/`、Git内部、docsなどを静的公開対象から除外する。
- Workers Static Assets型のビルドではここが重要。

## 7. D1データベース

### Binding

| Binding | 用途 |
|---|---|
| `RESERVATIONS_DB` | 予約・会員・営業不可・LINE仮予約などの中心DB |
| `LINE_BOOKINGS_DB` | 任意。存在すればLINE仮予約保存先として利用。なければ `RESERVATIONS_DB` |

### 主要テーブル

| テーブル | 役割 |
|---|---|
| `members` | 会員マスタ、会員種別、PIN、予約トークン、ステータス |
| `member_sessions` | 会員ログインセッション |
| `reservations` | 予約本体 |
| `reservation_events` | 予約作成/変更/キャンセル履歴 |
| `session_memos` | 枠ごとのメモ |
| `business_closures` | 営業不可設定 |
| `session_trainer_overrides` | 枠ごとの担当者上書き |
| `member_ng_pairs` | NG会員ペア |
| `line_booking_requests` | LINE仮予約 |

### migration

`migrations/0001_reservations.sql` から `0019_normalize_non_referral_guest_count.sql` まで存在。

2026-05-31時点の過去メモでは、本番D1は `0019_normalize_non_referral_guest_count.sql` まで適用済み。

## 8. 外部サービス

| サービス | 用途 | 関連ファイル |
|---|---|---|
| GitHub | 公式サイト/コード管理 | repo `ryuichi1124/dojojapan` |
| Cloudflare Pages | 静的サイトとFunctions | `wrangler.jsonc`、`functions/` |
| Cloudflare D1 | 予約DB | `migrations/`、API各種 |
| Cloudflare KV | LINE会話状態、認証失敗回数、通知レート制限 | `LINE_BOT_SESSIONS` |
| Cloudflare Worker | `dojo-japan.jp` からPagesへのプロキシ | `workers/dojo-reservation-proxy/worker.js` |
| LINE Messaging API | LINE bot、リッチメニュー | `functions/api/line/*` |
| 外部メールPHP | 管理者通知 | `https://crossbeams.xsrv.jp/mail/dojo-reservation-mail.php` |
| Instagram | 問い合わせDM導線 | `https://www.instagram.com/dojo_japan/` |
| GA4 | 計測 | `assets/js/analytics.js` |

## 9. 環境変数 / secrets

値は書かない。必要な名前のみ記録する。

| 変数 | 用途 |
|---|---|
| `RESERVATION_ADMIN_USER` | 管理画面/API認証ID |
| `RESERVATION_ADMIN_PASSWORD` | 管理画面/API認証パスワード |
| `LINE_CHANNEL_SECRET` | LINE webhook署名検証 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE返信・プロフィール・リッチメニューAPI |
| `DOJO_MAIL_SECRET` | 外部メールPHPへの認証 |
| `DOJO_MAIL_ENDPOINT` | メール送信先。未指定時は既定URL |
| `CHATBOT_COPY_NOTIFY_TO` | チャットボットコピー通知先 |

## 10. デプロイ経路と現在の注意点

### 公式サイトの通常経路

```text
local edit
  -> git commit
  -> git push origin main
  -> Cloudflare Pages build/deploy
  -> dojojapan.pages.dev
  -> dojo-reservation-proxy
  -> dojo-japan.jp
```

### 予約/LINE系の注意点

過去メモでは、2026-05-31時点でCloudflare Pagesに直接デプロイされた履歴があり、GitHub `origin/main` とCloudflare本番の差分に注意が必要とされていた。

その後、GitHub mainには以下のコミットが入っている:

- `dc45f2f` Let Instagram links open directly
- `9727090` Configure Cloudflare static assets

本番がまだ旧HTMLを返す場合は、Cloudflareの最新ビルドログを確認する。

### Cloudflareビルドで見るポイント

- 最新SourceがGitHub mainの最新コミットか。
- Pages projectとしてビルドされているか、Workers Static Assetsとしてビルドされているか。
- `wrangler.jsonc` が読まれているか。
- `assets.directory` と `.assetsignore` の扱い。
- build outputが `.` か。

## 11. 代表的な調査コマンド

```bash
# GitHub最新
git -C /Users/matsuhisaryuichi/Desktop/dojo-japan-project/site log -1 --oneline
git -C /Users/matsuhisaryuichi/Desktop/dojo-japan-project/site status --short

# 本番HTMLの確認
curl -L --max-time 20 -sS 'https://dojo-japan.jp/?check=1' | rg 'analytics\.js|Instagram'

# Pages配信元の確認
curl -L --max-time 20 -sS 'https://dojojapan.pages.dev/?check=1' | rg 'analytics\.js|Instagram'

# JS構文チェック
node --check assets/js/analytics.js
node --check assets/js/chatbot.js
node --check assets/js/member-reserve.js
node --check assets/js/staff-reservations.js

# Cloudflare Pages direct deployが必要な場合
wrangler pages deploy . --project-name dojojapan
```

## 12. よくある事故パターン

### 公式サイトと予約/LINE系を混同する

`dojo-japan.jp` と言われた場合でも、公式サイトのリンクや表示ならGitHub管理の静的HTML/JSが対象。予約・LINE・D1は別の運用境界として扱う。

### 公式サイトのInstagramリンクをチャットボットに誘導してしまう

`assets/js/analytics.js` に `preventDefault()` と `chatbotToggle.click()` を入れると、ページ上のInstagram CTAがInstagramへ飛ばずチャットボットを開く。計測JSは計測だけにする。

### Cloudflare PagesとWorkers Static Assetsの設定が混ざる

`pages_build_output_dir` はPages用、`assets.directory` はWorkers Static Assets用。Cloudflare側のビルド方式により必要な設定が変わる。現在は両方に対応するため `wrangler.jsonc` に両方を持たせている。

### D1 migrationを確認せずにAPIだけ変える

APIが参照するカラムが本番D1にないと即時障害になる。予約/LINE系の変更前には、適用済みmigrationと本番D1の状態を確認する。

### 管理画面JS/CSSのキャッシュ

管理画面は運用影響が大きい。JS/CSSを更新したらHTML側のクエリパラメータも更新する。

## 13. 未確定・要確認事項

- Cloudflareの現在の本番デプロイ方式がPages標準ビルドかWorkers Static Assetsビルドか、ダッシュボードで確認する。
- `dojo-reservation-proxy` が現在も本番ルートを全て受けているか、Cloudflare Routesで確認する。
- GitHub mainとCloudflare Production deploymentのSource SHAが一致しているか確認する。
- `LINE_BOOKINGS_DB` が本番で別DBとして存在するか、未設定で `RESERVATIONS_DB` にフォールバックしているか確認する。

