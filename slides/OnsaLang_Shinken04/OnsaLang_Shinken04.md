---
title: LLMと人に優しいDSPプログラム言語「Onsa」
author: centrevillage
date: "2026-10-14"
event: "Shinken #04"
design: dark
page_number: true
---

<!-- page: title -->
# <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="200" height="200" style="display:block;margin:0 auto 24px"><path d="M118 48 V196 a82 82 0 0 0 164 0 V48" fill="none" stroke="#e8590c" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/><rect x="177" y="262" width="46" height="100" rx="23" fill="#e8590c"/></svg>LLMと人に優しい<br>DSPプログラム言語「Onsa」
音を書くための、新しい言語を作っています

<!-- note: ロゴは H1 の先頭にインライン SVG で置いている(タイトルページでは画像記法が使えないため)。候補は img/logo_a〜e.svg、一覧は logo_candidates.html -->

---

## なぜ新しい言語を作るのか？

- **LLM が書きやすい言語とは？**
  - 「一つの意図に書き方は一つ」。読み方が分かれない文法
  - エラーが**局所的**で、関数の中だけ見れば直せる
- **今、新しい言語が必要だとしたら、どの領域？**
  - 汎用言語は飽和。LLM は既存の言語を十分に書ける
  - まだ「決定版」がない、小さく閉じた領域
- **DSP(音の信号処理)なら？**
  - 定番の FAUST は強力だが、記法が独特で LLM も人も読みづらい
  - FAUST の代わりになる言語なら、作る価値がある

---

## 何がしたいのか

- **LLM を使って開発を高速化したい**
  - エフェクターやシンセの「中身」を、言葉で指示して書かせる
- **IDE で音を確かめながら開発したい**
  - FAUST のように、書いたそばから鳴らして聴く
- **あらゆる環境にトランスパイルできる「基準」にしたい**
  - PC のプラグインも、ヒープのないマイコンも、同じソースから
- **独自言語の開発は、プログラマの夢・・・**

---

## 「Onsa」という名前

::: col
### 音叉
- DSP 開発の**ベース**となるもの
- 基準となる音程を鳴らす道具
- 「これに合わせる」ための存在
:::

::: col
### 音鎖
- 音の流れを**チェイン**する
- データフロー形式で、音の処理をつないでいく
- 音の連鎖
:::

---

## Onsa の文法

- 汎用言語の部分は **Rust** に似ている
  - 関数・構造体・型注釈・所有権の考え方
- 信号処理の部分は **Lustre** に似た同期データフロー
  - `flow` の本体は「1 サンプルごとに評価される関数」
  - 状態は遅延(`prev~`)にしか現れず、結線の誤りはコンパイル時に落ちる
- FAUST と違って、**すべての信号に名前がある**
- LLM が読みやすい文法を目指した結果、**人にも読みやすくなった**

```onsa title="one_pole.onsa"
pub flow one_pole(x: F32 at sample, p: F32 at block) -> F32 at sample {
  let y = (1.0 - p) * x + p * prev~(^y)
  y
}
```

---

## FAUST との比較(1次ローパス)

::: col
```dsp title="FAUST: one_pole.dsp"
import("stdfaust.lib");
p = hslider("p", 0.99, 0, 1, 0.01);
process = *(1 - p) : + ~ *(p);
```
:::

::: col
```onsa title="Onsa: one_pole.onsa"
pub flow one_pole(
  x: F32 at sample,
  p: F32 at block,
) -> F32 at sample {
  let y = (1.0 - p) * x + p * prev~(^y)
  y
}
```
:::

- FAUST は **point-free**: 信号に名前がなく、`:` と `~` で配線をつなぐ。`~` が暗黙に 1 サンプル遅らせる
- Onsa は信号 `x`・`p`・`y` に**名前がある**。帰還は `prev~(^y)` と書き手が明示する
- `at block` / `at sample` で、その値がどの速さで変わるかが読める

---

## Rust との比較(汎用の処理)

::: col
```rs title="Rust: point.rs"
struct Point { x: f32, y: f32 }
impl Point {
  fn scale(&mut self, k: f32) {
    self.x *= k;
    self.y *= k;
  }
}
// 呼ぶ側
let mut p = Point { x: 3.0, y: 4.0 };
p.scale(2.0);
```
:::

::: col
```onsa title="Onsa: point.onsa"
struct Point { x: F32, y: F32 }
impl Point {
  fn scale(inout self, k: F32) {
    self.x = self.x * k
    self.y = self.y * k
  }
}
// 呼ぶ側
var p = Point { x: 3.0, y: 4.0 }
p.scale!(2.0)
```
:::

- 見た目はほぼ同じ: `fn`・`struct`・`impl`・型注釈、最後の式が値
- 参照(`&mut`)の代わりに `inout`。呼ぶ側にも `!` が付き、**何が変わるかが 1 行で分かる**
- シグネチャは完全注釈、型推論は関数の中だけ。エラーが**局所的**で LLM が直しやすい

---

## flow をつなぐ(音鎖)

```onsa title="voice.onsa"
pub flow voice(f0: F32 at block, gain: F32 at block) -> F32 at sample {
  let src = saw~(f0)                     // のこぎり波
  let f1  = resonator~(src, 700.0, 80.0) // 母音の共鳴 1
  let f2  = resonator~(src, 1220.0, 120.0)
  (f1 + f2) * smooth~(gain, 0.01)        // ゲインをなめらかに
}
```

- `名前~(...)` は、状態を持つ **flow のインスタンス**を作る
- 上から下へ、音の流れがそのまま読める
- ここから C のコードが生成され、プラグインにもマイコンにも入る(予定)

---

## 開発の状況

- 最初に **C トランスパイラまで一気に**作った
  - 仕様 → 構文解析 → 意味解析 → C 出力、までは動いた
  - でも**バグだらけ**だった・・・
- 設計をガッチリ固めて、**作り直し中**
  - 仕様書(0.3 版)を先に書き、仕様の例をそのままテストにする
  - 「決めていないことは実装しない」
- 作り直しの現在地
  - **構文解析**(+ フォーマッタ)がほぼ完了
  - これから**意味解析**(名前・型・レートの検査)へ
- 公開: [github.com/centrevillage/onsalang](https://github.com/centrevillage/onsalang)

---

<!-- page: title -->
# 質疑応答
ご質問・ご意見をお待ちしています
