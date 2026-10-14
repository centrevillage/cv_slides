# scripts/languages の文法ファイルの入手元とライセンス

Shiki に同梱されていない言語の TextMate 文法です(DETAILED_SPEC.md 4.8)。
ビルド時に `JSON.parse` でデータとして読み込みます(JS モジュールとしては読み込みません)。

| ファイル | 言語 | 入手元 | ライセンス |
| --- | --- | --- | --- |
| `onsa.tmLanguage.json` | Onsa | 自作(このリポジトリで作成。第三者の文法ではありません) | — |
| `supercollider.tmLanguage.json` | SuperCollider | supercollider/language-supercollider | MIT |
| `faust.tmLanguage.json` | FAUST | jpcima/language-faust | MIT |

---

## supercollider.tmLanguage.json

- 入手元: https://github.com/supercollider/language-supercollider
- ファイル: https://raw.githubusercontent.com/supercollider/language-supercollider/master/grammars/supercollider.cson
- コミット: `1d21ff70c8830610c7fa9ec408f377fc9bce0ba4`(2026-10-14 に `git ls-remote` で確認した HEAD)
- ライセンス: MIT(リポジトリの `LICENSE.md`。全文は下記)

### 変更点

- CSON から JSON に手作業で変換した(CSON パーサは使っていない)。
- `comment` を追加した(入手元と本ファイルへの参照)。
- shiki の JavaScript 正規表現エンジン(変換できないパターンをエラーにする設定)で動かすため、Oniguruma 独自の構文を書き換えた:
  - 数値のパターン: アトミックグループ `(?>...)` を非キャプチャグループ `(?:...)` に変更(マッチする文字列は変わらない)。`(?![^[:space:][:digit:]])` を `(?![^\s\d])` に変更。
  - 関数の引数 `|...|` のパターン: 文字クラス内の POSIX クラス `[[:space:]]` を `\s` に変更し、不要なエスケープ(`\#`、`\"`、`\_`、`\=`、`\.`、`\(`、`\)`、`\,`)を外した。
  - シンボル `\name` のパターン: `[a-zA-Z0-9\_]` を `[a-zA-Z0-9_]` に変更(同じ意味)。

### ライセンス全文

```
The MIT License (MIT)

Copyright (c) 2014-2015 Chris Sattinger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## faust.tmLanguage.json

- 入手元: https://github.com/jpcima/language-faust
- ファイル: https://raw.githubusercontent.com/jpcima/language-faust/master/grammars/faust.cson
- コミット: `93a620e7db713a9858c123e5be5e880ca53856c9`(2026-10-14 に `git ls-remote` で確認した HEAD)
- ライセンス: MIT(リポジトリの `LICENSE.md`。元になった rsms/faust.tmbundle の MIT ライセンス表記を含む。全文は下記)

### 変更点

- CSON から JSON に手作業で変換した(CSON パーサは使っていない)。Atom 専用のキー `keyEquivalent` は削除した。
- `comment` に入手元と本ファイルへの参照を追記した。
- shiki の JavaScript 正規表現エンジンで動かすため、Oniguruma 独自の構文を書き換えた:
  - `printf_verbs`: 回数指定 `{,2}` を `{0,2}` に変更。文字クラス `[\+#\-0\x20]` を `[+#\-0\x20]` に変更(同じ意味)。
  - `string_escaped_char`: 文字クラス内の `\'` を `'` に変更(同じ意味)。
  - 数値のパターン: CSON 上の `[\-\+]`(CSON の文字列として `[-+]` になる)を JSON では `[-+]` と書いた。
- キーワードを追記した: 組込みプリミティブ(`constant.symbol.faust`)に `route`、`soundfile`、`waveform`、キーワード(`keyword.control.faust`)に `case`。

### ライセンス全文

```
Copyright (c) 2014 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

--------------------------------------------------------------------

This package was derived from a TextMate bundle located at
https://github.com/rsms/faust.tmbundle and distributed under the following
license, located in `LICENSE`:

Copyright (c) 2009 Rasmus Andersson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
