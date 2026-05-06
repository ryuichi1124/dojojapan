# DŌJŌ JAPAN — Official Website

福岡市中央区春吉の総合武道ジム **DŌJŌ JAPAN** の公式サイト。

- 本番ドメイン: https://dojo-japan.jp/
- ホスティング: Cloudflare Pages
- スタック: 静的 HTML / CSS / JS（ビルド不要）

## ページ構成

| パス | 内容 |
|---|---|
| `/` (`index.html`) | TOP — ヒーロー動画・トレーナー・ジム空間スライダー・料金・体験 CTA・アクセス |
| `/concept.html` | コンセプト（ロゴ＋動画） |
| `/trainers.html` | トレーナー一覧 |
| `/trainer/{yahiro,matsushima,satoru,luke}.html` | 各トレーナー詳細 |
| `/gym.html` | 設備のご案内（メインフロア・ラウンジ・シャワー） |
| `/pricing.html` | 料金プラン |
| `/faq.html` | よくあるご質問 |
| `/access.html` | アクセス・店舗情報 |
| `/terms.html` | 利用規約 |
| `/privacy.html` | プライバシーポリシー |

## デプロイ（Cloudflare Pages）

GitHub の `main` ブランチへの push で自動デプロイされます。

- Build command: なし（静的サイト）
- Build output directory: `/` (リポジトリルート)
- Root directory: `/`

## ローカル確認

ビルド不要。任意の HTTP サーバを立てて確認:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 主な技術ポイント

- 多言語チャットボット（JA/EN/KO/ZH）— Instagram DM 誘導 + コピーペースト式問い合わせ
- LocalBusiness JSON-LD 構造化データ（MEO 対応）
- Cloudflare Pages 配信前提（HTTP/3, Brotli, Auto-Minify）
- レスポンシブデザイン
- `prefers-reduced-motion` 対応
