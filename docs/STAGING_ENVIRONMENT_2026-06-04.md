# Staging Environment

作成日: 2026-06-04

## 目的

公開サイト・予約管理画面・予約API・D1 migration を本番に反映する前に検証するための、Cloudflare Pages / D1 / KV の分離環境。

stagingでは公開サイトもCloudflare Pagesに統合し、管理画面・会員予約画面・Pages Functions と同一Pages projectで検証する。

## 本番とstagingの分離

| 種別 | 本番 | staging |
| --- | --- | --- |
| Pages project | `dojojapan` | `dojojapan-staging` |
| Pages URL | `https://dojojapan.pages.dev/` | `https://dojojapan-staging.pages.dev/` |
| D1 database | `reservations-db` | `reservations-db-staging` |
| D1 database id | `1f06ffe1-f481-4297-a93e-ca0f38a158da` | `002ee028-e24e-4144-aab5-2730cc2935ef` |
| KV namespace title | `LINE_BOT_SESSIONS` | `LINE_BOT_SESSIONS_STAGING` |
| KV namespace id | `621594ecc3b843ca8fb1be480fcd391e` | `4331936a8ed043b0bc524848fbe2ecbe` |

stagingのFunctions内binding名は、本番コードと同じ `RESERVATIONS_DB` / `LINE_BOT_SESSIONS` を使う。binding先だけstaging専用D1/KVに向ける。

## staging設定ファイル

staging専用設定:

```text
site/wrangler.staging.jsonc
```

Cloudflare Pages の `wrangler pages deploy` は `--config` による任意configパスを受け付けない。そのため、stagingへdeployする時は一時ディレクトリへコピーし、一時コピー内の `wrangler.jsonc` を `wrangler.staging.jsonc` の内容に差し替えてからdeployする。

本番用 `site/wrangler.jsonc` は変更しない。

## 初期構築ログ

作成済み:

```bash
npx --yes wrangler@latest d1 create reservations-db-staging
npx --yes wrangler@latest kv namespace create LINE_BOT_SESSIONS_STAGING
npx --yes wrangler@latest pages project create dojojapan-staging --production-branch=staging
npx --yes wrangler@latest d1 migrations apply reservations-db-staging --remote --config wrangler.staging.jsonc
```

適用済みmigration:

```text
0001_reservations.sql
0002_reservation_capacity_guard.sql
0003_member_booking_access.sql
0004_member_status.sql
0005_member_deleted_status_backfill.sql
0006_member_sessions.sql
0007_member_quota_extra.sql
0008_member_monthly_extra_and_pause.sql
0009_personal_training_reservations.sql
0010_member_ng_pairs.sql
0011_business_closures.sql
0012_business_closures_lookup_index.sql
0013_session_trainer_overrides.sql
0014_member_kana.sql
0015_line_booking_requests.sql
0016_line_booking_profile.sql
0017_reservation_line_request_guard.sql
0018_referral_guest_reservations.sql
0019_normalize_non_referral_guest_count.sql
0020_operational_logs.sql
```

## Secret

staging Pages project `dojojapan-staging` に以下を設定済み。

```text
RESERVATION_ADMIN_USER
RESERVATION_ADMIN_PASSWORD
RESERVATION_OWNER_USER
RESERVATION_OWNER_PASSWORD
```

パスワードの実値はMarkdownには保存しない。必要な場合はCloudflare Pages secretを再設定する。

## staging deploy手順

本番deployと混同しないため、staging deployは以下の流れで行う。

```bash
mkdir -p /private/tmp/dojo-japan-staging-deploy
rsync -a --delete --exclude .git --exclude node_modules --exclude .wrangler site/ /private/tmp/dojo-japan-staging-deploy/
cp /private/tmp/dojo-japan-staging-deploy/wrangler.staging.jsonc /private/tmp/dojo-japan-staging-deploy/wrangler.jsonc
cd /private/tmp/dojo-japan-staging-deploy
npx --yes wrangler@latest pages deploy . --project-name=dojojapan-staging --branch=staging --commit-dirty=true --commit-message='staging deploy'
```

stagingでは公開サイトもテスト対象に含むため、検索indexを避ける。deploy前に一時コピー内の `_headers` の `/*` へ次を追加する。

```text
X-Robots-Tag: noindex, nofollow
```

2026-06-04時点のstagingには反映済み。

注意:

- `--project-name=dojojapan-staging` 以外を使わない。
- D1 migrationは `reservations-db-staging --config wrangler.staging.jsonc` 以外に実行しない。
- `dojo-japan.jp` のカスタムドメインはstagingへ接続しない。
- LINE webhook / rich menu / LINE API はstagingへ接続しない。

## 初回検証結果

2026-06-04 に以下を確認済み。

```text
https://dojojapan-staging.pages.dev/dj-ops-6271-kuroobi/ -> 200
https://dojojapan-staging.pages.dev/ -> 200
https://dojojapan-staging.pages.dev/pricing -> 200
https://dojojapan-staging.pages.dev/concept -> 200
https://dojojapan-staging.pages.dev/api/reservations/bootstrap 未認証 -> 401
staging管理者ID/PWで /api/reservations/bootstrap -> 200
stagingオーナーID/PWで /api/reservations/bootstrap -> 200
公開TOPの `X-Robots-Tag` -> `noindex, nofollow`
```

D1確認:

```text
reservations-db-staging members: 10
reservations-db-staging reservations: 0
reservations-db-staging operational_logs: 0
```

この状態は初期migrationのダミー会員だけを含む。実在本番会員・本番予約データは含まない。

## 今後の検証対象

- 特別会員 `special` のDB設計
- 会員編集で月回数・月額を入力するUI
- 名前入力予約の料金区分
  - 初回無料体験
  - ビジター1回目
  - ビジター2回目以降
  - レンタル有無
- オーナー権限限定の売上集計
  - 日報
  - 月報
  - 会費見込み
  - 都度売上

## 売上集計staging実装

実装日: 2026-06-04

stagingにのみ反映済み。本番 `dojojapan` / 本番D1 `reservations-db` には未反映。

追加migration:

```text
0021_owner_revenue_special_members.sql
```

staging D1 `reservations-db-staging` に適用済み。

追加した主なDB項目:

```text
members.member_type: special を許可
members.monthly_fee_yen
reservations.billing_category
reservations.rental_yen
```

料金ルール:

```text
正会員 prime: 33,000円
準会員 月8 semi8: 19,000円
準会員 月4 semi4: 15,000円
準会員 月2 semi2: 10,000円
特別会員 special: 会員編集で月回数・月額を入力
初回無料体験 trial: 0円
ビジター1回目 visitor_first: 3,000円
ビジター2回目以降 visitor_repeat: 5,000円
道着レンタル: 2,000円
パーソナル personal: 3,000円
```

staging UI:

```text
オーナーIDログイン時だけ売上集計パネルを表示
通常管理者IDログイン時は売上集計パネルを非表示
月選択で月報を表示
選択中の日付の日報を表示
名前で追加時に初回体験/ビジター1回目/ビジター2回目以降/その他を選択
名前で追加時に道着レンタルを加算可能
会員登録・会員編集で特別会員を選択可能
特別会員では月回数・月額を入力
```

staging QA:

```text
node --check functions/api/reservations/[[path]].js -> OK
node --check assets/js/staff-reservations.js -> OK
owner bootstrap -> 200 / adminRole owner
admin bootstrap -> 200 / adminRole admin
special member save STG-900 -> 200
manual visitor_repeat + dogi booking -> 200 / price_yen 7000 / billing_category visitor_repeat / rental_yen 2000
Playwright owner login -> 売上集計表示
Playwright admin login -> 売上集計非表示
```

staging検証用に作成したデータ:

```text
member_code: STG-900
display_name: 特別 テスト
member_type: special
monthly_quota: 6
monthly_fee_yen: 12000

reservation:
session_id: 2026-06-10-10
display_name: ビジター 売上テスト
billing_category: visitor_repeat
rental_yen: 2000
price_yen: 7000
```

注意:

- 月報の会費は「削除済み以外の会員」の見込み売上として算出する。
- 未払い・日割り・休会時の課金停止などは未実装。必要なら支払管理テーブルを別途設計する。
- 本番へ反映する前に、特別会員の18時以降枠の扱い、休会中会員の会費計上ルールを確定する。

## Production Data Sync To Staging

実施日: 2026-06-04

目的:

```text
本番DBの予約・会員データを staging DB に反映し、売上集計や今後の管理画面改修を本番相当データで検証する。
```

影響範囲:

```text
production D1 reservations-db: 読み取りのみ
staging D1 reservations-db-staging: 上書き
production Pages / production KV: 変更なし
```

コピー対象:

```text
members: 65
reservations: 285
line_booking_requests: 13
reservation_events: 155
business_closures: 2
session_trainer_overrides: 1
session_memos: 0
member_ng_pairs: 0
```

stagingから削除・非コピー:

```text
member_sessions: 0件にリセット
operational_logs: 0件にリセット
```

staging用にマスクした会員認証情報:

```text
booking_token
pin_hash
pin_salt
phone_last4
birth_mmdd
token_revoked_at
pin_updated_at
auth_locked_until
failed_auth_count
```

検証結果:

```text
staging count check -> OK
sensitive member fields count -> 0
owner bootstrap -> 200 / adminRole owner
Playwright owner login -> 売上集計表示 / 月報合計 797,000円
Playwright admin login -> 売上集計非表示
```

注意:

```text
本番から同期したため、以前staging検証用に作成した STG-900 と ビジター売上テスト予約は上書きで削除済み。
会員本人用ログイン情報はstagingでは無効化しているため、会員ログイン導線の検証にはstaging専用の認証情報を再発行する必要がある。
```

## Reservation Billing Edit

実施日: 2026-06-04

目的:

```text
予約済みの未登録・体験・ビジター予約について、あとから売上区分と道着レンタル有無を変更できるようにする。
```

staging実装内容:

```text
予約済み行に「編集」ボタンを追加
編集フォームで区分を選択
  - 会員予約
  - 初回無料体験
  - ビジター1回目
  - ビジター2回目以降
  - その他
  - パーソナル
道着レンタル +2,000円 を後からON/OFF可能
保存時は reservations.billing_category / price_yen / rental_yen のみ更新
予約枠・会員種別・定員消費は変更しない
```

追加API:

```text
POST /api/reservations/reservation-billing
```

QA:

```text
node --check functions/api/reservations/[[path]].js -> OK
node --check assets/js/staff-reservations.js -> OK
API: trial 0円の一時予約を visitor_repeat + 道着レンタルへ変更 -> price_yen 7000
Playwright 390px / 770px / 1280px: 編集ボタンから visitor_first + 道着レンタルへ変更 -> 画面表示 ¥5,000 / DB price_yen 5000
QA一時予約: 削除済み / 残数0
```
