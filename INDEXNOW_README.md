# IndexNow — DOJO JAPAN

dojo-japan.jp の即時インデックス通知（Bing / Yandex / Naver / Seznam.cz）設定。

## キー
- API Key: `0214b1aec5fa43ba8bd69cc4b6314eab`
- Key file: `/0214b1aec5fa43ba8bd69cc4b6314eab.txt`（このディレクトリ直下、git 追跡済）
- 検証: https://dojo-japan.jp/0214b1aec5fa43ba8bd69cc4b6314eab.txt が `0214b1aec5fa43ba8bd69cc4b6314eab` を返せば OK

## 使い方

```bash
# sitemap-pages.xml の全 URL を通知
python3 ../scripts/indexnow_submit.py

# 任意の URL のみ通知（コンテンツ更新時に推奨）
python3 ../scripts/indexnow_submit.py https://dojo-japan.jp/pricing https://dojo-japan.jp/training
```

成功判定: HTTP 200 / 202。失敗時は本文を確認。

## 注意
- キーファイルを削除・改名すると IndexNow 全エンドポイントから 4xx が返る
- 1 日に同一 URL を大量に再送しないこと（スパム判定リスク）
- Google は IndexNow 不参加。Google には Search Console のサイトマップ ping or URL 検査ツールで対応
