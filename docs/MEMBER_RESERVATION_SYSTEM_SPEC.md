# DŌJŌ JAPAN 会員予約システム設計書

作成日: 2026-05-25

## 1. 目的

会員が自分で予約・変更・キャンセルできる仕組みを追加する。既存のスタッフ向け予約管理画面、D1 データベース、公式 LINE webhook を活かし、将来の専用アプリ移行にも耐える API 中心の構成にする。

## 2. 基本方針

- 予約ルールはフロントではなく API と D1 側で必ず検証する。
- スタッフ管理画面、会員 Web 予約、公式 LINE、将来の専用アプリは同じ予約 API と D1 を使う。
- 会員登録そのものは本人に自由登録させず、スタッフが会員を作成する。
- 本人には初回有効化と本人確認だけを行わせる。
- LINE は便利な入口として使うが、LINE 未利用者でも専用 URL + PIN で予約できるようにする。

## 3. 想定規模

- 会員数: 100〜200名程度
- 予約枠: 07:00〜18:00終了、1時間単位
- 定員: 1枠6名
- 会員種別:
  - 正会員: 月間予約無制限
  - 準会員 月8
  - 準会員 月4
  - 準会員 月2

## 4. 利用者種別

### 4.1 スタッフ

- 既存の予約管理画面を使う。
- 会員の作成・編集を行う。
- 会員ごとの予約 URL / PIN / LINE 紐付け状態を管理する。
- 必要に応じて予約の代理登録、変更、キャンセルを行う。

### 4.2 LINE 連携済み会員

- 公式 LINE のリッチメニューから予約画面を開く。
- 初回だけ本人確認を行い、LINE userId と会員を紐付ける。
- 次回以降は LINE 経由で自分の予約画面に入れる。

### 4.3 LINE 未利用会員

- 会員専用 URL と PIN で予約画面に入る。
- QR カード、メール、SMS、店頭案内で URL を渡す。
- LINE がなくても予約・変更・キャンセルできる。

### 4.4 将来の専用アプリ利用者

- アプリ初回認証後、同じ会員 ID と予約 API を使う。
- 予約履歴、会員種別、月間上限、LINE 紐付け情報は引き継ぐ。

## 5. 推奨導入フェーズ

### Phase 1: 会員 Web 予約

- 会員専用 URL + PIN 認証
- 自分の予約一覧
- 新規予約
- 予約変更
- キャンセル
- 管理画面で URL / PIN 発行

### Phase 2: 公式 LINE 連携

- LINE リッチメニューに予約ボタンを追加
- 初回本人確認
- LINE userId と会員を紐付け
- 予約完了・変更・キャンセル通知を LINE 送信

### Phase 3: 専用アプリ

- アプリ認証 ID を会員に紐付け
- プッシュ通知
- QR 会員証
- チェックイン
- 決済や会費連携を必要に応じて追加

## 6. 本人確認方式

### 6.1 初回有効化

スタッフが会員を作成し、会員専用 URL を発行する。会員は初回アクセス時に本人確認情報を入力する。

推奨:

- 電話番号下4桁
- 誕生日 MMDD

最低構成:

- 電話番号下4桁

初回確認後、会員は PIN を設定またはスタッフ発行 PIN を利用する。

### 6.2 2回目以降

LINE 連携済み:

- LINE userId で会員を特定
- 必要に応じて PIN 再入力

LINE なし:

- booking_token + PIN

## 7. URL / 認証設計

### 7.1 会員専用 URL

例:

```text
https://dojo-japan.jp/dj-member-rsv-8f3k2q/?token=<booking_token>
```

`booking_token` はランダムな長い値にする。推測可能な会員コードだけでは入れない。

### 7.2 PIN

- PIN は平文保存しない。
- D1 には `pin_hash` と `pin_updated_at` を保存する。
- 実装初期は SHA-256 + salt、将来的には Workers で利用可能な強い KDF を検討する。
- PIN 失敗回数を記録し、一定回数失敗時は一時ロックする。

### 7.3 セッション

Web:

- 認証済み状態は sessionStorage か短命セッション token で保持する。
- 共用端末対策としてログアウトボタンを置く。

LINE:

- LINE userId と会員の紐付けを D1 に保存する。
- LINE 側から開いた場合も API 側で会員本人の予約だけ返す。

アプリ:

- app_user_id または device/session token を別テーブルで会員に紐付ける。

## 8. D1 スキーマ案

### 8.1 members 拡張

既存 `members` に追加する候補:

```sql
alter table members add column booking_token text;
alter table members add column pin_hash text;
alter table members add column pin_salt text;
alter table members add column phone_last4 text;
alter table members add column birth_mmdd text;
alter table members add column token_revoked_at text;
alter table members add column pin_updated_at text;
alter table members add column auth_locked_until text;
alter table members add column failed_auth_count integer not null default 0;
alter table members add column quota_extra integer not null default 0;
alter table members add column quota_extra_month text;
alter table members add column pause_on text;
```

### 8.2 LINE 紐付けテーブル

```sql
create table if not exists member_line_accounts (
  id text primary key,
  member_code text not null,
  line_user_id text not null unique,
  linked_at text not null default (datetime('now')),
  revoked_at text,
  foreign key(member_code) references members(member_code)
);
```

### 8.3 将来アプリ用アカウント

```sql
create table if not exists member_app_accounts (
  id text primary key,
  member_code text not null,
  app_user_id text not null unique,
  linked_at text not null default (datetime('now')),
  revoked_at text,
  foreign key(member_code) references members(member_code)
);
```

### 8.4 予約イベントログ

予約の作成・変更・キャンセル履歴を後から追えるようにする。

```sql
create table if not exists reservation_events (
  id text primary key,
  reservation_id text,
  member_code text,
  event_type text not null,
  from_session_id text,
  to_session_id text,
  actor_type text not null,
  actor_id text,
  created_at text not null default (datetime('now')),
  note text
);
```

`actor_type` 例:

- staff
- member_web
- line
- app

## 9. API 設計

### 9.1 スタッフ API

既存 `/api/reservations/*` を継続する。スタッフ API は管理 ID / パスワードで保護する。

既存:

- `GET /api/reservations/bootstrap`
- `POST /api/reservations/member`
- `POST /api/reservations/book`
- `POST /api/reservations/cancel`
- `POST /api/reservations/memo`

追加候補:

- `POST /api/reservations/member-token`
- `POST /api/reservations/member-pin-reset`
- `POST /api/reservations/member-line-unlink`

### 9.2 会員 API

新設:

```text
POST /api/member/auth/activate
POST /api/member/auth/login
GET  /api/member/me
GET  /api/member/reservations
GET  /api/member/availability
POST /api/member/reservations/book
POST /api/member/reservations/change
POST /api/member/reservations/cancel
```

### 9.3 LINE 連携 API

既存 `/api/line/webhook` を拡張する。

追加候補:

```text
POST /api/line/member-link/start
POST /api/line/member-link/verify
```

ただし LINE は LIFF を使う場合、Web 予約ページ側で `line_user_id` 相当の検証情報を受ける設計も検討する。

## 10. 予約ルール

API 側で必ず検証する。

- 予約可能時間は 07:00〜17:00 開始まで。
- 18:00 開始枠は作らない。
- 1枠の定員は6名。
- 同じ会員が同じ枠に重複予約できない。
- 準会員は月間上限を超えられない。ただし管理者が会員ごとに `quota_extra` と `quota_extra_month` を設定した場合は、その月だけ基本上限に追加して判定する。
- `pause_on` が当日以前になった会員は休会扱いとし、スタッフ予約・会員予約の両方で予約不可にする。
- キャンセル済み予約は上限計算に含めない。
- 本人は自分の予約しか変更・キャンセルできない。
- スタッフは代理操作できる。

## 11. 予約変更

変更は内部的に以下で処理する。

```text
旧予約を cancelled
新しい予約を confirmed
reservation_events に change を記録
```

API は以下を同一処理内で確認する。

- 旧予約が本人の予約か
- 旧予約が confirmed か
- 新しい枠が有効時間内か
- 新しい枠に空きがあるか
- 月間上限を超えないか
- 同じ枠に重複していないか
- 変更期限内か

## 12. キャンセル

キャンセルは `reservations.status = cancelled` に更新する。履歴は消さない。

会員側 API は以下を確認する。

- 本人の予約か
- confirmed か
- キャンセル期限内か

## 13. 変更・キャンセル期限

初期値:

```text
開始3時間前まで変更・キャンセル可能
```

運用に合わせて `system_settings` テーブルを作り、後から変更可能にする。

候補:

```sql
create table if not exists system_settings (
  key text primary key,
  value text not null,
  updated_at text not null default (datetime('now'))
);
```

## 14. LINE 通知

通知タイミング:

- 予約完了
- 予約変更
- キャンセル
- 前日リマインド
- 当日リマインド

通知文例:

```text
予約が完了しました。
05/30 09:00-10:00
変更・キャンセルはこちら
```

LINE 未連携会員には通知しないか、メール/SMS を将来検討する。

## 15. 管理画面追加仕様

会員管理に追加する項目:

- 電話番号下4桁
- 誕生日 MMDD
- 予約 URL 表示
- URL コピー
- URL 再発行
- PIN 再設定
- LINE 紐付け状態
- LINE 紐付け解除
- 休会 / 無効化

会員一覧で表示する状態:

- 有効
- 休会
- LINE連携済み
- URL未発行
- 認証ロック中

## 16. 会員 Web 画面

### 16.1 初回画面

- 予約専用 URL からアクセス
- 電話番号下4桁、誕生日 MMDD を入力
- PIN 設定または PIN 確認

### 16.2 通常画面

- 自分の予約一覧
- 空き枠一覧
- 予約ボタン
- 変更ボタン
- キャンセルボタン

### 16.3 表示方針

- スマホ最優先
- 1画面に詰め込みすぎない
- 予約可能な枠だけを強調
- 満席・上限到達・期限切れは理由を表示

## 17. セキュリティ方針

- 会員コードだけで本人扱いしない。
- booking_token は推測不能にする。
- PIN は平文保存しない。
- LINE userId 紐付け前に本人確認を行う。
- API はフロント入力を信用しない。
- 予約・変更・キャンセルは API 側で必ず権限確認する。
- 管理者認証情報は永続保存しない。
- 重要操作は `reservation_events` に記録する。

## 18. アプリ移行方針

将来アプリ化しても、D1 と予約 API は原則そのまま使う。

アプリ化時に追加するもの:

- app_user_id 紐付け
- アプリ用短命セッション
- プッシュ通知 token
- QR 会員証
- チェックイン API

移行時の会員案内:

```text
これまでの予約情報をそのまま引き継げます。
アプリをインストール後、初回本人確認を行ってください。
```

## 19. 実装順序

1. D1 schema 拡張
2. スタッフ管理画面に本人確認情報・URL/PIN管理を追加
3. 会員 Web API を追加
4. 会員 Web 予約画面を追加
5. 予約変更・キャンセル API を追加
6. reservation_events を記録
7. LINE userId 紐付け
8. LINE通知
9. LINEなし会員向け QR/PIN運用
10. 将来アプリ用 API を整備

## 20. 初期リリースの最小仕様

まず作るべき最小構成:

- 管理画面で会員の `booking_token` と PIN を発行
- 会員 Web ページで PIN ログイン
- 自分の予約一覧
- 新規予約
- キャンセル
- 変更
- API 側で本人・定員・月間上限・営業時間・重複を検証

LINE 連携はこの最小構成の後に追加する。
