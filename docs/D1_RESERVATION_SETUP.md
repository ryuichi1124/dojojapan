# DŌJŌ JAPAN 予約管理 D1 セットアップ

## 1. D1 データベース作成

```bash
npx wrangler d1 create dojojapan-reservations
```

作成後に表示される `database_id` を `wrangler.jsonc` に追加する。

```jsonc
"d1_databases": [
  {
    "binding": "RESERVATIONS_DB",
    "database_name": "dojojapan-reservations",
    "database_id": "ここに database_id"
  }
]
```

## 2. スキーマ投入

```bash
npx wrangler d1 execute dojojapan-reservations --file=./migrations/0001_reservations.sql --remote
```

## 3. 管理画面ログイン

本番では管理画面用のIDとパスワードを Cloudflare Pages のシークレットに設定する。

```bash
npx wrangler pages secret put RESERVATION_ADMIN_USER --project-name dojojapan
npx wrangler pages secret put RESERVATION_ADMIN_PASSWORD --project-name dojojapan
```

管理画面を開いたときに、このIDとパスワードでログインするとD1の予約データを読み書きできる。

## 4. 保存される情報

D1に保存するもの:

- 会員コード
- 表示名
- 会員種別
- 会員ステータス
- 月間予約上限
- 電話番号下4桁
- 誕生日 MMDD
- 予約URL用トークン
- PINハッシュ
- 予約日時枠
- 予約状態
- 枠メモ

D1に保存しないもの:

- 電話番号全体
- メールアドレス
- 住所
- 決済情報
- 詳細メモ

## 5. 現在の状態

D1バインディング `RESERVATIONS_DB` がない環境では、管理画面は自動的にブラウザ内 `localStorage` 保存へ戻る。
