# DOJO JAPAN incident handoff 2026-05-31

この文書は、2026-05-31 の公式サイト・LINE・予約システム混線対応の引き継ぎメモです。
次回以降、このrepoを読む担当者は、作業前に必ずこの文書と `PRODUCTION_ARCHITECTURE_AUDIT_2026-05-31.md` を確認してください。

## 事故の要点

当日の問題は、`dojo-japan.jp` 配下に複数システムが同居しているにもかかわらず、依頼範囲と本番経路を混同したことです。

- 公式サイト表示の修正依頼に対して、LINE/予約側のファイルやCloudflare設定まで影響範囲を広げてしまった。
- `GitHub push = 本番反映` と判断してはいけない構成だった。
- `dojojapan` は Cloudflare Workers と Pages の両方に存在し、名前だけでは配信元を判断できない。
- 公式サイト通常ページ、LINE、予約管理、会員予約、API は同じドメインでも経路が違う。

## 現在の本番構成

詳細は `docs/PRODUCTION_ARCHITECTURE_AUDIT_2026-05-31.md` を正とします。

要約:

- 公式サイト通常ページ: `dojojapan` Worker static assets
- 予約/LINE/API: `dojo-reservation-proxy` -> `dojojapan.pages.dev`
- `dojojapan.pages.dev`: Pages側。GitHub接続なし、またはGitHub最新と同期しない可能性があるため、必要時は `wrangler pages deploy` で実測反映する
- `dojo-reservation-proxy`: API、会員予約、予約管理、LINE管理などのパスだけを Pages へ流す

作業前に必ず対象URLを `curl` で確認し、どの経路で返っているかを実測してください。

## 触ってよい範囲の原則

依頼が「公式サイトの表示」に関する場合:

- 主対象は `index.html`, 各HTML, `assets/css/style.css`, `assets/js/main.js`, `assets/js/analytics.js`, `assets/js/chatbot-site.js`
- `functions/api/*`, `dj-member-rsv-8f3k2q/`, `dj-ops-6271-kuroobi/`, `dj-line-menu-admin/`, `assets/js/member-reserve.js`, `assets/js/staff-reservations.js`, LINE rich menu alias, D1 は触らない

依頼が「LINE予約」「会員予約」「予約管理」に関する場合:

- 公式サイト通常ページではなく、予約/LINE/API側の対象として扱う
- 本番反映は GitHub push だけで完了扱いにしない
- 本番URLで読み込みJS/CSSパラメーター、API応答、対象文言を確認してから完了報告する

## 当日修正した主な内容

### 公式サイト Instagram / BOOK

- 公式サイト内Instagramリンクでbotが起動する問題を修正
- `assets/js/analytics.js` からInstagram DMクリックをbot起動に結びつける処理を削除
- HTML側のanalytics読み込みパラメーターを `20260531-no-instagram-handling` に更新
- BOOKボタンは `assets/js/chatbot-site.js?v=20260531-toggle-compat` を読む形に変更
- `chatbot-site.js` は `dojoChatbotToggle` と `chatbotToggle` の両方に対応

### Cloudflare route

- `dojo-reservation-proxy` から `dojo-japan.jp/*` の包括ルートを外した
- `dojo-japan.jp/assets/js/chatbot.js*` のproxyルートを外した
- 公式サイト通常ページ全体を予約proxyに流さない構成へ戻した
- 予約/LINE/APIに必要な個別ルートは維持

### LINE rich menu

- 会員タブ/ゲストタブのaliasを復元・確認
- 以後、LINE rich menu alias は明示依頼がない限り触らない
- 既知alias:
  - `dojo-member -> richmenu-cf3ccd65bdde723cc874710eecce02d4`
  - `dojo-guest -> richmenu-2ce374c0443f77fd4729a0790e963691`

### LINE初回体験・ビジター名前入力

- LINE webhookの名前入力プロンプトを更新
- 反映確認用fingerprint:
  - `build: 2026-05-31-line-name-keyboard-v1`
  - `namePromptPreview` に「画面左下のキーボードアイコンをタップして、トークにお名前を入力してください。」を含む
- `wrangler pages deploy` により Pages 本番へ反映済み

### 予約管理の会員管理一覧

コミット:

```text
9339d38 Show unauthenticated members in admin list
```

内容:

- 会員管理一覧で、会員ステータスが `active` でも本人ログイン履歴がない会員は `未認証` と表示
- `未認証` は赤いバッジ表示
- 休会/削除/予約可否ロジックは変更なし
- 判定は現在ログイン中セッションではなく `lastAuthenticatedAt` の有無
- JS/CSS読み込みパラメーター:
  - `20260531-unauth-member`

本番反映:

- GitHub push済み
- Cloudflare Pages手動デプロイ済み
- Deploy URL: `https://f271e67c.dojojapan.pages.dev`

検証:

- `https://dojo-japan.jp/dj-ops-6271-kuroobi/` が `20260531-unauth-member` を読んでいる
- 本番JSに `manageMemberStatusOf`, `unauthenticated`, `lastAuthenticatedAt` がある
- 本番CSSに `.member-status--unauthenticated` がある

## 会員ログイン取り違えについての確認

質問:

LINE予約からログインして、他のユーザーとしてログインされる可能性はあるか。

確認結果:

- 別端末・別LINEユーザーへ勝手に他人情報が混ざる構造ではない
- Cloudflareやブラウザキャッシュで他人のAPIレスポンスが配られる可能性は低い
- ただし、同一端末・同一LINE内ブラウザ・同一ブラウザで前回ログイン情報が残っている場合、同じ会員として表示されることはある
- ユーザー確認では「同じ端末で同じユーザーが表示されるのは問題ない」とのこと

今後さらに堅くするなら:

- `/api/member/*`, `/api/reservations/*`, `/api/line/*` に `Cache-Control: no-store` を明示する
- 共用/検証端末向けに「ログアウト」「別会員でログイン」を目立たせる
- 最終的にはLINE userIdと会員を紐づけるLIFF/LINE認証方式が最も確実

## 本番反映時の注意

Cloudflare Pagesへの手動デプロイ例:

```sh
npx wrangler pages deploy . --project-name=dojojapan --branch=main --commit-hash=<commit> --commit-message='<message>'
```

注意:

- `wrangler deploy` は Pages ではなく Worker deploy のため、このrepoのPages反映には使わない
- Pages deploy時に `wrangler.jsonc` の `pages_build_output_dir` 警告が出ても、静的assetsとFunctions bundleのアップロード自体は完了する
- 完了後はデプロイURLだけでなく `https://dojo-japan.jp/...` の本番URLで確認する

## 完了報告前チェック

最低限、次を確認してから完了報告すること。

- `git status --short` で無関係な変更を巻き込んでいない
- 変更対象のJSは `node --check` する
- HTML側のJS/CSS読み込みパラメーターが更新されている
- 本番URLで新しいパラメーターや対象文言が確認できる
- API/LINE/予約系は GitHub push だけで完了扱いにしない
- 公式サイト表示だけの依頼でLINE/予約/D1を触っていない

## 未追跡ファイル

2026-05-31時点で、次の未追跡ファイルがある。

```text
docs/RESERVATION_FIX_LOG_2026-05-31.md
```

これは既存の未追跡ファイルとして扱い、依頼なく削除・巻き込みコミットしない。

## 2026-06-01 追記

ユーザーから「ここまでをmdに保存しておいて」と再依頼があったため、この引き継ぎ文書自体を継続保存先として扱う。

2026-06-01時点の保存状態:

- `docs/INCIDENT_HANDOFF_2026-05-31.md` に当日の混線原因、構成、修正内容、検証方法を保存済み
- `site/AGENTS.md` からこの文書を必読として参照済み
- プロジェクトルート `../AGENTS.md` からもこの文書を必読として参照済み
- Codex memory `~/.codex/memories/dojo-japan-system-boundaries.md` にも必読文書として保存済み

直近の重要コミット:

```text
484e45d Document incident handoff
9339d38 Show unauthenticated members in admin list
391c6d6 Document verified production architecture
```

注意:

- `484e45d Document incident handoff` はローカルコミット済みだが、この時点ではユーザー確認なしに `git push` していない。
- `git push`、Cloudflare deploy、LINE API操作、D1 write/migration は、引き続き事前確認なしに実行しない。
- 未追跡の `docs/RESERVATION_FIX_LOG_2026-05-31.md` は、依頼なく削除・巻き込みコミットしない。

## 2026-06-02 追記: 予約システム operational logging

ユーザーから、管理スタッフ/会員側で問題が起きたときに後から原因を追えるよう、予約システムの管理者側・会員側の両方にログを残したいという依頼があった。

### 本番反映済みコミット

```text
b672842 Add reservation operational logging
```

変更ファイル:

```text
functions/api/member/[[path]].js
functions/api/reservations/[[path]].js
migrations/0020_operational_logs.sql
```

### D1 migration

本番D1 `RESERVATIONS_DB` に、既存テーブルを変更せず新規テーブルのみ追加した。

```sql
create table if not exists operational_logs (
  id text primary key,
  area text not null check (area in ('admin', 'member')),
  actor_type text not null,
  actor_id text,
  operation text not null,
  status text not null check (status in ('success', 'error')),
  member_code text,
  reservation_id text,
  session_id text,
  error_code text,
  metadata_json text,
  user_agent text,
  created_at text not null default (datetime('now'))
);

create index if not exists operational_logs_created_idx
  on operational_logs(created_at);

create index if not exists operational_logs_member_idx
  on operational_logs(member_code, created_at);

create index if not exists operational_logs_area_operation_idx
  on operational_logs(area, operation, created_at);
```

本番migration結果:

```text
npx wrangler d1 migrations apply reservations-db --remote
0020_operational_logs.sql ✅
Executed 5 commands in 0.92ms
```

重要:

- 既存の `members`, `reservations`, `member_sessions` などには `ALTER` していない。
- 既存予約データ・会員データは変更していない。
- `operational_logs` は追加テーブルなので、旧コードに戻しても参照されず動作影響はない。

### Pages deploy

本番Pages deploy:

```text
npx wrangler pages deploy . --project-name=dojojapan --branch=main --commit-hash=b672842 --commit-message='Add reservation operational logging'
Deploy URL: https://a422bb9b.dojojapan.pages.dev
```

### ログ対象

高頻度のGET系は記録しない。POST系の重要操作だけ記録する。

管理者側:

- `member`
- `member-status`
- `member-delete`
- `member-access`
- `member-pin-reset`
- `book`
- `cancel`
- `line-booking-approve`
- `line-booking-cancel`
- `memo`
- `business-closure`
- `business-closure-delete`
- `trainer-override`
- `trainer-override-delete`

会員側:

- `auth/login`
- `auth/logout`
- `profile`
- `reservations/book`
- `reservations/cancel`
- `reservations/change`

### 保存しない情報

安全優先で、以下は保存しない。

- 管理者パスワード
- 会員PIN
- booking token / session token の生値
- コピー本文
- 電話番号下4桁・誕生日など本人確認値の本文

ログに保存する主な項目:

- `area`: `admin` / `member`
- `operation`
- `status`: `success` / `error`
- `member_code`
- `reservation_id`
- `session_id`
- `error_code`
- `metadata_json`
- `user_agent`
- `created_at`

### 既存動作への影響確認

本番反映前に、本番コミット `ee6a4c5` のクリーンコピーを `/private/tmp/dojo-japan-prod-baseline` に作成し、ローカルD1へ既存migration `0001` から `0019` を適用した。

本番基準のローカルスモークテスト:

```text
admin page: 200 OK
member page: 200 OK
admin bootstrap: 200 OK
admin member-pin-reset: 200 OK
member login: 200 OK
member me: 200 OK
admin book: 200 OK
member reservations: 200 OK
```

その後、ログ実装と `0020_operational_logs.sql` をローカル環境に適用して同じスモークテストを実行。最初に会員APIで `readJsonSafe` / `recordMemberOperationalLogSafe` 未定義による500を検出し、修正後に再テストした。

修正後のローカルスモークテスト:

```text
admin page: 200 OK
member page: 200 OK
admin bootstrap: 200 OK
admin member-pin-reset: 200 OK
member login: 200 OK
member me: 200 OK
admin book: 200 OK
member reservations: 200 OK
```

ローカルD1のログ確認:

```text
admin / member-pin-reset / success / DJ-004
member / auth/login / success / DJ-004
admin / book / success / DJ-004 / 2026-06-03-10
```

PIN、管理者パスワード、booking token はログに含まれていないことを確認済み。

構文確認:

```text
node --check functions/api/reservations/[[path]].js
node --check functions/api/member/[[path]].js
git diff --check
```

すべてOK。

### 本番反映後確認

本番反映直後に実施した非破壊確認:

```text
https://dojo-japan.jp/dj-ops-6271-kuroobi/ -> 200
https://dojo-japan.jp/dj-member-rsv-8f3k2q/ -> 200
https://dojo-japan.jp/api/reservations/bootstrap -> 未認証 401
https://dojo-japan.jp/api/member/me -> 未認証 401
select count(*) from operational_logs -> 0
```

その後、実運用で次の成功ログが記録されたことを確認:

```text
member / reservations/cancel / success / DJ-012
admin / book / success / DJ-012 / 2026-06-20-17
```

この時点で `error_code` はどちらも `null`。エラーログは出ていない。

### ロールバック方針

万一、ログ実装後にAPIエラーや表示影響が出た場合:

1. Pagesコードだけ `ee6a4c5` 相当へ戻す。
2. D1の `operational_logs` テーブルは急いで削除しない。
3. 予約/会員データには触らない。

理由:

- 旧コードは `operational_logs` を参照しないため、テーブルが残っていても動作影響はない。
- 本番稼働中に `DROP TABLE` などを急いで実行する方がリスクが高い。

ロールバック用の基準コミット:

```text
ee6a4c5 Fix admin modal scrolling
```

### 運用メモ

- 成功ログは重要操作だけ残す。空き枠取得・会員一覧取得・ページ表示など高頻度GETは残さない。
- トラブル調査時は、まず `operational_logs` を `member_code`, `operation`, `created_at`, `status`, `error_code` で絞る。
- 保存期間は将来的に90日から180日程度で削除運用を検討する。
- ログ保存に失敗しても、本来の予約・ログイン・キャンセル処理を止めない設計にしている。
