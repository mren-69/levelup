# LEVEL UP(自分専用・リアルレベルアップ)

日常のクエストをこなすと経験値が入り、レベルと役職が上がるiPhone用Webアプリ。設計は `docs/design.md`。

## パソコンで確認する
```
npm test          # ゲームの規則のテスト
npm run serve     # http://localhost:8080/ で開く
```

## iPhoneで使う(公開してホーム画面に追加)
iPhoneのホーム画面に追加してオフラインで使うには、HTTPSのアドレスで公開する必要がある。
次のファイルとフォルダだけを公開する: `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `js/`, `icons/`, `fonts/`
(`docs/`, `tests/`, `tools/`, `mockups/` は公開しない)

1. GitHub Pages か Cloudflare Pages に上の一式を置く
2. iPhoneのSafariでそのアドレスを開く → 共有 →「ホーム画面に追加」
3. **ホーム画面のアイコンから開いて使う**(Safariのタブで記録したデータとは別扱いになる)

## 更新するとき
アプリのファイルを変えたら、`sw.js` の `VERSION` を上げる(例: `levelup-v2`)。上げないと、iPhoneに古い版が残る。

## アイコンを作り直す
```
node tools/make-icons.js
```
