# DOJO JAPAN システム境界整理

最終更新: 2026-05-31

この文書は、DOJO JAPAN の「公式サイト」「予約システム」「LINE 関連」を混同しないための運用メモです。  
同じ `dojo-japan.jp` 上に見えても、変更対象・影響範囲・本番反映方法が異なるため、作業前に必ず該当セクションを確認してください。

## 2026-05-31 本番監査の必読メモ

詳細な本番実測結果は次を必ず読む。

- `docs/PRODUCTION_ARCHITECTURE_AUDIT_2026-05-31.md`

重要な訂正:

- 公式サイト通常ページは `dojojapan` Worker static assets が返している。
- LINE / 予約 / API 系は `dojo-reservation-proxy` 経由で `dojojapan.pages.dev` に流れている。
- `dojojapan.pages.dev` はGitHub main最新ではない古いPages配信元として残っている。
- したがって、GitHub mainへpushしても `/api/line/webhook` などLINE/API本番に反映されるとは限らない。
- 本番反映済みかどうかは、必ず対象URLの `curl` 実測で判断する。

## 絶対ルール

1. 依頼対象が「公式サイトの表示」の場合、LINE 本体・リッチメニュー・予約 DB・管理 API は触らない。
2. 依頼対象が「LINE」の場合、LINE API への同期・alias 変更・デフォルトメニュー変更は実行前に必ず確認を取る。
3. 依頼対象が「予約システム」の場合、D1 migration・予約 API・会員画面・管理画面の変更は公式サイトとは別作業として扱う。
4. `git push`、Cloudflare deploy、LINE API POST/DELETE、D1 書き込みは、実行前に「何を変えるか」を明示する。
5. 調査中に別システムの問題を見つけても、依頼範囲外なら修正せず、報告だけにする。

## 1. 公式サイト

### 目的

一般公開される DOJO JAPAN のブランドサイト。料金、アクセス、トレーナー、FAQ、体験導線、Instagram 導線を表示する。

### 主なファイル

| 種別 | 場所 | 内容 |
|---|---|---|
| TOP | `index.html` | 公式サイトTOP |
| 下層ページ | `concept.html`, `flow.html`, `pricing.html`, `faq.html`, `access.html`, etc. | 公式サイトの公開ページ |
| 共通CSS | `assets/css/style.css` | 公式サイト表示 |
| 共通JS | `assets/js/main.js` | 公式サイトUI |
| 計測JS | `assets/js/analytics.js`, `assets/js/analytics-instagram-direct.js` | GA4等のクリック計測 |
| サイト内bot | `assets/js/chatbot.js` | Webサイト上のチャットUI |

### 触ってよい例

- 公式サイト内の文章、画像、レイアウト修正
- Instagramリンクの遷移先やクリック挙動
- TOP / FLOW / FAQ など公開ページの表示崩れ
- 公式サイト内のチャットUI表示

### 触ってはいけない例

- LINE Official Account のリッチメニュー本体
- LINE rich menu alias
- D1 の予約データ
- 予約 API
- 会員予約画面・スタッフ管理画面

### 注意点

- `dojo-japan.jp` の公開ページに見えても、`/api/*` や `/dj-member-rsv-8f3k2q/` は公式サイト本文ではない。
- Instagramリンクの問題は公式サイト側のHTML/JSで扱う。LINEリッチメニューのInstagramボタンは別物。

## 2. 予約システム

### 目的

会員予約、スタッフ管理、LINE経由の予約相談を扱う業務システム。

### 主な画面

| パス | 内容 |
|---|---|
| `/dj-member-rsv-8f3k2q/` | 会員予約画面 |
| `/dj-ops-6271-kuroobi/` | スタッフ予約管理画面 |
| `/dj-line-menu-admin/` | LINEリッチメニュー管理画面 |

### 主なAPI

| API | ファイル | 内容 |
|---|---|---|
| `/api/member/*` | `functions/api/member/[[path]].js` | 会員ログイン、会員予約、変更、キャンセル |
| `/api/reservations/*` | `functions/api/reservations/[[path]].js` | スタッフ管理、会員管理、予約管理、LINE予約承認 |
| `/api/chatbot/*` | `functions/api/chatbot/*.js` | Webチャット用補助API |

### データベース

| 種別 | 内容 |
|---|---|
| Cloudflare D1 | 予約システム本体DB |
| binding | `RESERVATIONS_DB` |
| migrations | `migrations/0001_*.sql` から `migrations/0019_*.sql` |

### 触る前に確認が必要な操作

- D1 migration 実行
- `functions/api/member/*` の変更
- `functions/api/reservations/*` の変更
- 会員予約画面 `dj-member-rsv-8f3k2q` の仕様変更
- スタッフ管理画面 `dj-ops-6271-kuroobi` の仕様変更
- 予約データの追加、削除、修正

### 公式サイトとの境界

公式サイトから予約画面へリンクすることはあるが、予約画面と予約APIは業務システム。  
公式サイトの表示修正だけの依頼では、予約システム側は触らない。

## 3. LINE 関連

### 目的

LINE公式アカウントから、会員・非会員を予約/案内導線へ誘導する。LINE Messaging API とリッチメニューを使う。

### 主な構成

| 種別 | 場所 | 内容 |
|---|---|---|
| LINE Webhook | `functions/api/line/webhook.js` | LINEメッセージ応答 |
| リッチメニュー同期API | `functions/api/line/rich-menu-sync.js` | LINE APIへメニュー作成・alias更新 |
| LINE管理画面 | `dj-line-menu-admin/index.html` | リッチメニュー管理UI |
| 管理画面JS | `assets/js/line-menu-admin.js` | 管理画面から同期APIを呼ぶ |
| 管理画面CSS | `assets/css/line-menu-admin.css` | LINE管理画面表示 |
| リッチメニュー画像 | `assets/line/dojo-member-richmenu.jpg` | LINEへアップロードする画像 |
| 設計JSON | `../docs/line-rich-menu-member.json`, `../docs/line-rich-menu-guest.json` | LINE API用の元定義 |

### LINE本体の現在の重要設定

2026-05-31 時点で、タブ式の alias は以下に戻している。

| alias | richMenuId |
|---|---|
| `dojo-member` | `richmenu-cf3ccd65bdde723cc874710eecce02d4` |
| `dojo-guest` | `richmenu-2ce374c0443f77fd4729a0790e963691` |

### 絶対に確認が必要なLINE操作

- `dojo-member` / `dojo-guest` alias の変更
- default rich menu の変更
- rich menu の新規作成
- rich menu の削除
- rich menu 画像アップロード
- Webhook URL や Channel secret / access token の変更
- `/api/line/rich-menu-sync` への POST

### 公式サイトとの境界

LINEリッチメニュー内の「公式Instagram」や「DOJO公式サイト」ボタンは、LINEアプリ内のボタン。  
公式サイト内のボタンではない。公式サイトのInstagramリンク修正と混ぜない。

## 4. Cloudflare と配信経路

### Cloudflare Pages

公式サイトとPages Functionsの配信元。GitHub `main` からデプロイされる。

### wrangler設定

| ファイル | 用途 |
|---|---|
| `wrangler.jsonc` | Pages / Functions / KV / D1 binding |
| `wrangler.reservation-proxy.jsonc` | 予約系やAPIのルーティング補助Worker |

### binding

| binding | 用途 |
|---|---|
| `LINE_BOT_SESSIONS` | LINE会話状態、管理認証失敗回数 |
| `RESERVATIONS_DB` | 予約システムD1 |

### 注意点

- Cloudflareの「ビルド/デプロイ設定」は公式サイト反映に影響するが、LINE本体のaliasとは別。
- LINEリッチメニューはGitHubにpushしただけでは本番LINEに反映されない。LINE API同期が必要。
- 予約DBはGitHubにpushしただけでは更新されない。D1 migration 実行が必要。

## 5. 作業前チェックリスト

作業前に、依頼を必ず次のどれかに分類する。

| 分類 | 触る場所 | 触らない場所 |
|---|---|---|
| 公式サイト表示 | HTML, `assets/css/style.css`, `assets/js/main.js`, 公式サイト用analytics | LINE API, D1, 予約API |
| Webチャット | `assets/js/chatbot.js`, `/api/chatbot/*` | LINE rich menu alias, D1予約データ |
| LINEリッチメニュー | `functions/api/line/rich-menu-sync.js`, `dj-line-menu-admin`, LINE API | 公式サイトHTML, 予約DB |
| LINE予約応答 | `functions/api/line/webhook.js`, `LINE_BOT_SESSIONS` | 公式サイト表示 |
| 会員予約 | `dj-member-rsv-8f3k2q`, `/api/member/*`, D1 | LINEリッチメニュー本体 |
| スタッフ予約管理 | `dj-ops-6271-kuroobi`, `/api/reservations/*`, D1 | 公式サイトHTML |

## 6. 事故防止の運用

### 変更前に必ず出す確認文

```text
対象: 公式サイト / 予約システム / LINE のどれか
変更するファイル:
本番に影響する操作:
触らない範囲:
実行してよいか:
```

### 本番操作の扱い

| 操作 | 扱い |
|---|---|
| `git push` | 確認後 |
| Cloudflare deploy | 確認後 |
| LINE API POST/DELETE | 確認後 |
| D1 migration / D1 write | 確認後 |
| 読み取りAPI / `curl GET` | 調査目的なら可。ただしLINE/DBの場合は読み取りであることを明示 |

## 7. 今日の再発防止メモ

今回の問題は、依頼が「公式サイト内の表示」だったにもかかわらず、LINEリッチメニュー本体の管理・alias・同期に話を広げたことが原因。  
今後は、依頼文に「LINE」と出てきても、それが「公式サイト内に表示されているLINE導線」なのか「LINE公式アカウント本体」なのかを切り分ける。

不明な場合は作業せず、次の1問だけ確認する。

```text
これは公式サイト内の表示修正ですか？ それともLINE公式アカウント本体の修正ですか？
```
