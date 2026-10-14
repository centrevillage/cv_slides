# cv_slides

Markdown と画像から、オフラインで動く単一 HTML のスライドを生成するツール。

## クイックスタート

```sh
npm ci                            # 依存を入れる(Node.js ^24.18.1 または >=26、npm 11.10 以上)
./gen_slide.sh new my_talk        # slides/my_talk/my_talk.md を作る
./gen_slide.sh my_talk --watch    # 保存するたびに slides/my_talk/my_talk.html を再生成
open -a "Google Chrome" slides/my_talk/my_talk.html
```

## マニュアル

**[README_JP.html](README_JP.html)**: 使い方のすべて(コマンド、記法、ビューアの操作、コードサンプルページ、デザイン、警告・エラーの一覧)。

> GitHub 上では `.html` ファイルはソースのまま表示されます。リポジトリを clone して、`README_JP.html` をブラウザ(Chrome)で直接開いてください。外部への通信はなく、オフラインで読めます。

## 仕様

- [DETAILED_SPEC.md](DETAILED_SPEC.md): 詳細仕様
- [APP_SPEC.md](APP_SPEC.md): 要件定義
