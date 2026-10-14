# Shiki (build-time syntax highlighting): security, dependency tree and supply chain, compared with highlight.js and Prism. State as of 2026-10-14

Context: the use case is a local Node.js CLI that generates a single offline HTML file. Shiki runs only at build time, on the author's own snippets, and it may load custom TextMate grammars from local files.

Method note: all npm registry data below comes from `https://registry.npmjs.org/<pkg>` JSON, fetched 2026-10-14. The transitive tree was resolved by hand: for each semver range I took the highest matching version (the "latest" tag when it matched). Nothing was installed. Vulnerability data comes from OSV.dev API queries (`POST https://api.osv.dev/v1/query`, ecosystem npm), made 2026-10-14. The OSV npm feed also contains GHSA and MAL (malicious-package) records.

---

## Q1. Current version of `shiki`, its dependency tree, install size, install scripts

### Takeaway
The current release is **shiki 4.5.0** (published 2026-10-01; the 4.x major line started 2026-02-27). It resolves to **45 packages with ~15.0 MB unpacked**. About 58% of that is the bundled grammar collection (`@shikijs/langs`, 8.65 MB). No package in the tree declares a `preinstall`, `install` or `postinstall` script.

### Cited Findings
- `shiki` dist-tags: `latest: 4.5.0` (published 2026-10-01T06:46Z), plus a stale `next: 0.9.4` tag. First release of each major: 1.0.0 on 2024-02-07, 2.0.0 on 2025-01-20, 3.0.0 on 2025-02-18, 4.0.0 on 2026-02-27. The last 3.x release was 3.23.0 (2026-02-25). — [npm registry: shiki](https://registry.npmjs.org/shiki)
- `shiki@4.5.0` direct dependencies: `@shikijs/core`, `@shikijs/engine-javascript`, `@shikijs/engine-oniguruma`, `@shikijs/langs`, `@shikijs/themes` and `@shikijs/types` (all pinned to exactly `4.5.0`), plus `@shikijs/vscode-textmate ^10.0.2` and `@types/hast ^3.0.5`. Its only scripts are dev/build/test (`tsdown`, `vitest`, `wrangler`). Unpacked size is 602,495 bytes. — [npm registry: shiki](https://registry.npmjs.org/shiki)
- What each internal package depends on (4.5.0):
  - `@shikijs/core` → `@shikijs/types`, `@shikijs/primitive` (a new internal package), `@shikijs/vscode-textmate`, `hast-util-to-html ^9.0.5`, `@types/hast`.
  - `@shikijs/engine-javascript` → `oniguruma-to-es ^4.3.6`, `@shikijs/types`, `@shikijs/vscode-textmate`.
  - `@shikijs/engine-oniguruma` → `@shikijs/types`, `@shikijs/vscode-textmate`.
  - `@shikijs/langs` and `@shikijs/themes` → `@shikijs/types` only.
  - All are MIT, repository `github.com/shikijs/shiki`.
  - Sources: [@shikijs/core](https://registry.npmjs.org/@shikijs%2fcore), [@shikijs/engine-javascript](https://registry.npmjs.org/@shikijs%2fengine-javascript), [@shikijs/engine-oniguruma](https://registry.npmjs.org/@shikijs%2fengine-oniguruma)
- `oniguruma-to-es@4.3.6` (2026-04-19) → `oniguruma-parser ^0.12.2`, `regex ^6.1.0`, `regex-recursion ^6.0.2`. Both `regex` and `regex-recursion` → `regex-utilities ^2.3.0`. — [npm registry: oniguruma-to-es](https://registry.npmjs.org/oniguruma-to-es), [regex](https://registry.npmjs.org/regex)
- `hast-util-to-html@9.0.5` (2025-02-19) has 11 dependencies, including **`mdast-util-to-hast ^13.0.0`**. That package pulls in `@types/mdast`, `@ungap/structured-clone`, `devlop`, `micromark-util-sanitize-uri`, `trim-lines`, `unist-util-position`, `unist-util-visit` and `vfile`. So a markdown→hast converter ends up in the tree even though Shiki only serialises hast. — [npm registry: hast-util-to-html](https://registry.npmjs.org/hast-util-to-html), [mdast-util-to-hast](https://registry.npmjs.org/mdast-util-to-hast)
- **Resolved tree: 45 unique packages, 45 versions**, summed `dist.unpackedSize` = **14,953,958 bytes (≈15.0 MB)**. Largest items:
  - `@shikijs/langs` 8,650,980 B
  - `@shikijs/themes` 1,484,289 B
  - `oniguruma-to-es` 997,453 B
  - `oniguruma-parser` 663,934 B
  - `@shikijs/engine-oniguruma` 643,892 B (contains the inlined WASM)
  - `shiki` 602,495 B
  - `regex` 559,829 B
  - Source: registry metadata for each package, e.g. [@shikijs/langs](https://registry.npmjs.org/@shikijs%2flangs), [@shikijs/themes](https://registry.npmjs.org/@shikijs%2fthemes)
- The 45 packages by publisher account:
  - 9 from the Shiki team: shiki, @shikijs/{core, engine-javascript, engine-oniguruma, langs, primitive, themes, types, vscode-textmate}.
  - 5 from `slevithan`: oniguruma-to-es, oniguruma-parser, regex, regex-recursion, regex-utilities.
  - 26 from `wooorm` (unified/syntax-tree/micromark): ccount, character-entities-html4, character-entities-legacy, comma-separated-tokens, devlop, hast-util-to-html, hast-util-whitespace, html-void-elements, mdast-util-to-hast, micromark-util-{character, encode, sanitize-uri, symbol, types}, property-information, space-separated-tokens, stringify-entities, trim-lines, unist-util-{is, position, stringify-position, visit, visit-parents}, vfile, vfile-message, zwitch.
  - 3 from DefinitelyTyped `types`: @types/hast, @types/mdast, @types/unist.
  - 1 from `webreflection`: @ungap/structured-clone@1.4.0, published 2026-08-27.
  - 1 from `lukeed`: dequal@2.0.3.
  - Source: [npm registry](https://registry.npmjs.org/hast-util-to-html) (per-package `maintainers` / `_npmUser`)
- **Install scripts**: none of the 45 resolved versions declares `preinstall`, `install` or `postinstall`, and none carries a `gypfile` flag. The only lifecycle-like script is `regex-utilities@2.3.0` → `"prepare": "npm test"`. — [npm registry: regex-utilities](https://registry.npmjs.org/regex-utilities)
- npm runs `prepare` on `npm publish`/`npm pack`, on a local `npm install` with no arguments, and for **git** dependencies. The docs do not list installing a registry dependency as a trigger. `preinstall`/`install`/`postinstall` do run for dependencies. A package with a root `binding.gyp` and no install script gets `node-gyp rebuild` by default. — [npm Docs: scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts)
- The `@shikijs/engine-oniguruma` package needs `"node": ">=20"`. It exposes `./wasm-inlined` and takes `vscode-oniguruma` from the repo's "inlined" catalog (a dev dependency that is bundled, not installed at runtime). — [shiki repo: engine-oniguruma/package.json](https://github.com/shikijs/shiki/blob/main/packages/engine-oniguruma/package.json)
- The shiki workspace catalog pins `vscode-oniguruma: 1.7.0` and `hast-util-to-html: ^9.0.5` under `inlined:`. — [shiki repo: pnpm-workspace.yaml](https://github.com/shikijs/shiki/blob/main/pnpm-workspace.yaml)
- Shiki v1.0+ does not touch the filesystem. Custom grammars are read by the caller (e.g. `JSON.parse(fs.readFileSync('my-lang.json','utf8'))`) and passed in through `langs: [myLang]` or `highlighter.loadLanguage(myLang)`. — [Shiki docs: Load custom languages](https://shiki.style/guide/load-lang)

### Inferences
- With no install-time scripts anywhere in the tree, `npm install --ignore-scripts` costs nothing functionally. Any compromise would have to work through import-time code, which runs in the build process.
- The ~8.65 MB `@shikijs/langs` and ~1.48 MB `@shikijs/themes` are inert data, but they make up most of the auditable surface. The fine-grained form (`@shikijs/core` plus one engine plus only the needed `@shikijs/langs/<x>` imports, or `shiki-codegen`) trims what gets loaded at runtime. Since `shiki` hard-depends on `@shikijs/langs`, avoiding the install means depending on `@shikijs/core` and friends directly instead of `shiki`. (Inference from the dependency list; I did not verify how shiki's docs recommend doing this.)
- This repo was not resolved with a real lockfile. Caret ranges may resolve differently in the future. Pin through a lockfile.

### Gaps
- No packagephobia, pkg-size or npmgraph figure was fetched. The ~15.0 MB is a sum of registry `unpackedSize` values, not measured `node_modules` size on disk.
- I did not open tarballs to confirm the absence of `binding.gyp` or other files. That rests on registry metadata alone (no `gypfile` flag, no install scripts).

---

## Q2. Known CVEs / GHSAs for shiki, @shikijs/*, vscode-textmate, vscode-oniguruma, oniguruma-to-es, hast-util-to-html and the unified ecosystem

### Takeaway
OSV and GHSA list **zero advisories** for `shiki`, any `@shikijs/*` package, `vscode-textmate`, `vscode-oniguruma`, `oniguruma-to-es`, `oniguruma-parser`, `regex*` or `hast-util-to-html`. The only advisory touching the resolved tree is **CVE-2025-66400** in `mdast-util-to-hast` (moderate; fixed in 13.2.1, which is the version the tree resolves to). It does not apply to Shiki's code path. No unfixed advisories exist for the tree as of 2026-10-14. The upstream Oniguruma C library has old memory-safety CVEs, all fixed before 6.9.8, the version Shiki's WASM appears to be built from.

### Cited Findings
- OSV query (2026-10-14) returned **0 vulnerabilities**, including MAL records, for each of:
  - shiki, @shikijs/core, @shikijs/engine-oniguruma, @shikijs/engine-javascript, @shikijs/langs, @shikijs/themes, @shikijs/types, @shikijs/primitive, @shikijs/vscode-textmate, @shikijs/rehype, @shikijs/markdown-it, @shikijs/transformers, @shikijs/twoslash, shiki-codegen, tm-grammars, tm-themes
  - vscode-textmate, vscode-oniguruma, oniguruma-to-es, oniguruma-parser, regex, regex-recursion, regex-utilities
  - hast-util-to-html, hast-util-sanitize, hast-util-raw, hast-util-from-html, hast-util-to-string, hast-util-from-parse5, hast-util-to-jsx-runtime, property-information, stringify-entities
  - micromark, micromark-util-sanitize-uri, vfile, unist-util-visit, @ungap/structured-clone, dequal, devlop
  - unified, remark, remark-parse, remark-rehype, remark-gfm, rehype, rehype-raw, rehype-sanitize, rehype-stringify, mdast-util-from-markdown, mdast-util-gfm-autolink-literal, @mdx-js/mdx, refractor, lowlight, rehype-highlight, rehype-prism-plus
  - Source: [OSV.dev](https://osv.dev/list?ecosystem=npm&q=shiki) (queried through the `api.osv.dev/v1/query` endpoint)
- The shiki GitHub repo shows "There aren't any published security advisories" and "No security policy detected" (no SECURITY.md). — [GitHub: shikijs/shiki security](https://github.com/shikijs/shiki/security)
- **CVE-2025-66400 / GHSA-4fh9-h7wg-q85m**, `mdast-util-to-hast`:
  - Affected `>=13.0.0 <13.2.1`, patched in **13.2.1**. Moderate, CVSS v4 6.9 (integrity: low). CWE-20 and CWE-915.
  - Character references in a fenced-code info string (e.g. `js&#x20;xss`) produced `<code class="language-js xss">`, injecting extra unprefixed class names. This matters for apps that render untrusted markdown and style or script by generic class.
  - Published 2025-12-01 (NVD) / 2025-12-02 (GHSA).
  - Source: [GHSA-4fh9-h7wg-q85m](https://github.com/advisories/GHSA-4fh9-h7wg-q85m)
- `mdast-util-to-hast@13.2.1` was published 2025-11-23 and is the current latest, so `hast-util-to-html@9.0.5`'s range `^13.0.0` resolves to the fixed version. — [npm registry: mdast-util-to-hast](https://registry.npmjs.org/mdast-util-to-hast)
- Older unified-ecosystem advisories (not in Shiki's tree):
  - **CVE-2021-39199 / GHSA-9q5w-79cv-947m**, `remark-html` "unsafe defaults" (Critical). Fixed in 13.0.2 and 14.0.1, published 2021-09-07. — [GHSA-9q5w-79cv-947m](https://github.com/advisories/GHSA-9q5w-79cv-947m)
  - **CVE-2020-7753 / GHSA-w5p7-h5w8-2hfq**, ReDoS in `trim` (an old transitive dependency of remark-parse). Fixed in 0.0.3. — [GHSA-w5p7-h5w8-2hfq](https://github.com/advisories/GHSA-w5p7-h5w8-2hfq)
- Upstream Oniguruma C library: NVD lists CVEs from 2017 (Oniguruma 6.2.0: CVE-2017-9224…9229, OOB read/write) and from 2019:
  - CVE-2019-13224, use-after-free in `onig_new_deluxe`, 6.9.2
  - CVE-2019-13225, NULL deref, 6.9.2
  - CVE-2019-16163, stack exhaustion, "before 6.9.3"
  - CVE-2019-19012 / 19203 / 19204, "6.x before 6.9.4_rc2"
  - CVE-2019-19246, "through 6.9.3"
  - The only 2026 hit, CVE-2026-7259, is a PHP mbstring/Oniguruma encoding-list mismatch, fixed in PHP itself.
  - Sources: [NVD API keyword search "oniguruma"](https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=oniguruma), [NVD CVE-2019-13224](https://nvd.nist.gov/vuln/detail/CVE-2019-13224)
- `microsoft/vscode-oniguruma`'s `deps/oniguruma` submodule points to kkos/oniguruma commit `08d36110c5`. That commit is tagged **v6.9.8**, with the message "setup 6.9.8" (2022-04-15). — [GitHub: vscode-oniguruma deps](https://github.com/microsoft/vscode-oniguruma/tree/main/deps), [kkos/oniguruma commit 08d3611](https://github.com/kkos/oniguruma/commit/08d36110c5670c815ad6d6f969e578049d209080)
- `vscode-oniguruma` npm releases: 1.7.0 on 2022-11-25, 2.0.0 on 2023-09-01, 2.0.1 on 2023-09-15 (latest). Shiki inlines **1.7.0**. — [npm registry: vscode-oniguruma](https://registry.npmjs.org/vscode-oniguruma), [shiki pnpm-workspace.yaml](https://github.com/shikijs/shiki/blob/main/pnpm-workspace.yaml)
- **The upstream Oniguruma project has ended**: its README says "This project ended on April 24, 2025," and the GitHub repo is archived (last push 2025-04-24). Its last tag is v6.9.10. — [GitHub: kkos/oniguruma](https://github.com/kkos/oniguruma)
- `vscode-textmate` (Microsoft, latest 9.3.2, 2026-01-22) has no advisories. Shiki uses its own fork, `@shikijs/vscode-textmate@10.0.2` (2025-02-15), also with no advisories. — [npm registry: vscode-textmate](https://registry.npmjs.org/vscode-textmate), [npm registry: @shikijs/vscode-textmate](https://registry.npmjs.org/@shikijs%2fvscode-textmate)

### Inferences
- The Oniguruma inside Shiki's WASM is very likely 6.9.8: vscode-oniguruma 1.7.0 shipped in Nov 2022, after the submodule moved to 6.9.8 in Apr 2022. That version postdates every published Oniguruma memory-safety CVE (all ≤6.9.4). I did not confirm the exact submodule commit at the v1.7.0 tag.
- Upstream Oniguruma is end-of-life, and vscode-oniguruma has had no npm release since 2023-09. Any future Oniguruma bug will probably never be fixed upstream. The JS engine (`oniguruma-to-es`, actively maintained) avoids this dependency entirely.
- CVE-2025-66400 has no bearing on this CLI. Shiki only serialises hast it built itself, it does not parse markdown through `mdast-util-to-hast`, and the input is trusted. The CVE matters only if the slide generator separately uses remark/rehype on untrusted markdown, and even then 13.2.1 is fixed.

### Gaps
- I did not check Snyk-only advisories (SNYK-JS-*), which can include items without a GHSA. Snyk pages were not fetched.
- I did not verify the exact Oniguruma commit at the `vscode-oniguruma` v1.7.0 tag (the GitHub API was rate-limited).

---

## Q3. Oniguruma WASM engine vs JavaScript regex engine: ReDoS, WASM memory, and what a malicious or buggy grammar can do

### Takeaway
A TextMate grammar loaded as JSON is **data** (regexes plus scope names). The realistic worst case from a malicious or buggy grammar, or from adversarial input, is **CPU or memory exhaustion: a hung or crashed build**, not code execution. Shiki's per-line `tokenizeTimeLimit` (default 500 ms) is checked **between** regex scans, so it cannot interrupt one catastrophic regex. The JS engine relies on V8's backtracking `RegExp`, which has no built-in step limit. The Oniguruma WASM engine inherits Oniguruma's per-match retry limit (10,000,000) and runs inside the WASM sandbox.

### Cited Findings
- Shiki has two engines:
  - **Oniguruma** (default), "compiled … to WebAssembly", for "maximum language compatibility". It requires loading a large WASM file and is recommended for Node.js or build-time use.
  - **JavaScript RegExp**, which transpiles Oniguruma patterns with Oniguruma-To-ES. It is "faster for some languages", and "As of Shiki 3.9.1, all built-in languages are supported."
  - The JS engine is strict by default ("will throw an error if it encounters an invalid Oniguruma pattern or a pattern that it cannot convert"). `forgiving: true` suppresses this at the cost of "highlighting mismatches".
  - It prefers the RegExp `v` flag (Node 20+ / ES2024).
  - The Shiki docs make no statement about ReDoS, timeouts or regex security for either engine.
  - Source: [Shiki docs: RegExp Engines](https://shiki.style/guide/regex-engines)
- Shiki's tokenizer options: `tokenizeMaxLineLength` (default `0`, no limit) and `tokenizeTimeLimit` ("Time limit in milliseconds for tokenizing a single line", default 500). The code passes `tokenizeTimeLimit` to `grammar.tokenizeLine2(line, stateStack, tokenizeTimeLimit)`. — [shiki: packages/types/src/tokens.ts](https://github.com/shikijs/shiki/blob/main/packages/types/src/tokens.ts), [shiki: packages/primitive/src/highlight/code-to-tokens-base.ts](https://github.com/shikijs/shiki/blob/main/packages/primitive/src/highlight/code-to-tokens-base.ts)
- In vscode-textmate's `_tokenizeString`, the time limit is checked once per loop iteration: `while (!STOP) { if (timeLimit !== 0) { … if (elapsedTime > timeLimit) return … } scanNext(); }`. A single `scanNext()` regex search is never interrupted. — [microsoft/vscode-textmate: tokenizeString.ts](https://github.com/microsoft/vscode-textmate/blob/main/src/grammar/tokenizeString.ts)
- Oniguruma 6.9.8 defaults: `USE_RETRY_LIMIT` is defined, `DEFAULT_RETRY_LIMIT_IN_MATCH 10000000`, `DEFAULT_RETRY_LIMIT_IN_SEARCH 0 /* unlimited */`, `DEFAULT_PARSE_DEPTH_LIMIT 4096`, `DEFAULT_SUBEXP_CALL_MAX_NEST_LEVEL 20`. — [kkos/oniguruma v6.9.8 src/regint.h](https://github.com/kkos/oniguruma/blob/v6.9.8/src/regint.h)
- The vscode-oniguruma binding (`onig.cc`) calls `onig_new` and `onig_search` and never calls any retry-limit setter, so the defaults apply. The WASM is built with `emcc -O2 … -s ALLOW_MEMORY_GROWTH=1`. — [microsoft/vscode-oniguruma: src/onig.cc](https://github.com/microsoft/vscode-oniguruma/blob/main/src/onig.cc), [vscode-oniguruma: scripts/build.sh](https://github.com/microsoft/vscode-oniguruma/blob/main/scripts/build.sh)
- WebAssembly security model:
  - Modules execute "within a sandboxed environment separated from the host runtime" and "can't escape the sandbox without going through appropriate APIs".
  - Linear-memory accesses are bounds-checked at the region level. Buffer overflows can overwrite neighbouring objects in linear memory, but control-flow integrity and the protected call stack block direct code injection.
  - Source: [WebAssembly.org: Security](https://webassembly.org/docs/security/)
- Oniguruma-To-ES:
  - It emulates atomic groups and possessive quantifiers. Atomic `(?>…)` becomes `(?=(\2|\1))\3`-style lookahead/backreference constructs.
  - It follows Oniguruma 6.9.10 semantics and claims "~99.99% of real-world Oniguruma regexes are supported". Unsupported features throw.
  - Recursion depth defaults to Oniguruma's limit of 20 (`rules.recursionLimit` 2–20). The README warns that "Patterns that would trigger an infinite recursion error in Oniguruma might find a match in Oniguruma-To-ES".
  - The README has no security or ReDoS section.
  - Source: [GitHub: slevithan/oniguruma-to-es](https://github.com/slevithan/oniguruma-to-es)
- Grammar loading is caller-controlled. Shiki expects an already-parsed object (`JSON.parse(fs.readFileSync(...))`) and does no file I/O itself. — [Shiki docs: Load custom languages](https://shiki.style/guide/load-lang)

### Inferences
- **What a malicious grammar can do:**
  - Loaded via `JSON.parse`, a grammar has no code-execution channel. Its fields are regex strings, scope names, `include` references and embedded-language names.
  - Plausible harms: (a) ReDoS, i.e. catastrophic backtracking that hangs the build; (b) deep or recursive `include`/`begin`/`end` structures that blow up memory or the stack; (c) WASM linear-memory growth (`ALLOW_MEMORY_GROWTH=1`) until the allocation fails; (d) on the WASM path only, a hypothetical latent memory-safety bug in the archived Oniguruma 6.9.8 C code. Thanks to the sandbox, that bug could corrupt only WASM linear memory, not the Node host.
  - Loading a grammar as a **JS/TS module** (`import()`) instead of JSON makes it arbitrary code, and that is a different trust level. For author-owned grammars this is low risk, but recommend JSON plus `JSON.parse`.
- **Engine-specific ReDoS:**
  - Oniguruma: the 10M-retry per-match cap bounds a single match attempt, but search-level retries are unlimited. A long line can still take time on the order of (line length × 10M steps).
  - JS engine: V8's irregexp backtracking engine has no default step cap, so one pathological regex on one line can block the event loop indefinitely. The 500 ms `tokenizeTimeLimit` does not help within a single scan.
  - Neither engine should be treated as ReDoS-proof. For a build tool, the practical mitigation is a wall-clock watchdog, e.g. running highlighting in a `worker_threads` worker with a timeout, together with `tokenizeMaxLineLength`.
  - Oniguruma-To-ES's lookahead-based emulation of atomic groups and possessive quantifiers may avoid some backtracking blowups that a naive translation would cause. That is an inference from the design; no benchmark source was found.
- **Output-injection angle:** Shiki builds hast nodes and serialises them with `hast-util-to-html`, which escapes text and attributes. Grammar scope names normally become theme colours (inline `style`), not raw HTML. I found no advisory showing grammar-controlled content escaping into HTML.
- For a trusted-author, build-time-only setting, the threat model reduces to "a typo or bad regex in my own grammar can make the build hang". That is an availability problem, not a security one.

### Gaps
- No public ReDoS advisories were found specifically against TextMate grammars in `tm-grammars`, Shiki or vscode-textmate. I also found no measurements comparing ReDoS behaviour between the two engines.
- I did not verify whether `@shikijs/vscode-textmate` (the fork) changed the time-limit logic relative to Microsoft's `tokenizeString.ts`.
- I did not investigate prototype-pollution behaviour of grammar JSON keys such as `__proto__` inside the `repository` objects. No advisory exists, but nothing was tested.

---

## Q4. Effect of the 2025–2026 npm supply-chain incidents on shiki/@shikijs/unified packages, and concentration risk

### Takeaway
I found **no evidence** that any package in Shiki's tree, or the antfu, wooorm or slevithan accounts, was compromised in the Sept 2025 chalk/debug phishing, Shai-Hulud (Sept 2025), Shai-Hulud 2.0 (Nov 2025) or the 2026 waves (axios Mar; Bitwarden CLI and SAP Apr; TanStack and @antv May; Red Hat "Miasma" and node-gyp Jun; AsyncAPI Jul; keyv "ChainDrop" Aug). Registry metadata shows no removed or unpublished versions and no unexpected publishers. Concentration risk remains real: **26 of 45 packages (58%) can be published by the single `wooorm` npm account**, 18 of them with wooorm as sole maintainer, and none of those versions carry npm provenance.

### Cited Findings
- **Sept 8, 2025, chalk/debug ("qix") compromise:**
  - Phishing via the lookalike domain `npmjs.help`.
  - 18 packages: backslash, chalk-template, supports-hyperlinks, has-ansi, simple-swizzle, color-string, error-ex, color-name, is-arrayish, slice-ansi, color-convert, wrap-ansi, ansi-regex, supports-color, strip-ansi, chalk, debug, ansi-styles.
  - The payload was a browser crypto-wallet interceptor.
  - Source: [Aikido: npm debug and chalk packages compromised](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised)
  - None of these 18 names is in Shiki's resolved 45-package tree. — [npm registry: shiki tree](https://registry.npmjs.org/shiki) (resolved as in Q1)
- **Shai-Hulud (Sept 2025):**
  - Started with 40+ packages (including @ctrl/tinycolor) and passed 500 by 2025-09-18.
  - A `postinstall` hook ran `bundle.js`, used TruffleHog to scan for secrets, injected a GitHub Actions workflow, and republished all packages of the compromised maintainer.
  - Truesec's list contains no shiki, @shikijs, hast/mdast/unist/micromark/vfile, oniguruma-to-es/regex, highlight.js, prismjs or @antfu packages. That list covers the initial 40 only; the full list is at Socket.
  - Source: [Truesec: 500+ npm packages compromised (Shai-Hulud)](https://www.truesec.com/hub/blog/500-npm-packages-compromised-in-ongoing-supply-chain-attack-shai-hulud)
  - GitHub says it removed 500+ compromised packages after notification on 2025-09-14. — [GitHub Blog: Our plan for a more secure npm supply chain (2025-09-22)](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/)
- **Shai-Hulud 2.0 (Nov 2025):** I cross-checked the Wiz and Datadog consolidated IOC lists (795 package rows each) against the 45-package Shiki tree plus highlight.js and prismjs. **Zero overlap.** A prefix search for `@shikijs`, `@antfu`, `shiki`, `unist-`, `hast-`, `mdast-`, `micromark`, `vfile`, `rehype`, `remark`, `unified`, `@unocss`, `vite*`, `vitest`, `@vueuse`, `highlight`, `prism`, `oniguruma` and `regex` matched only `vite-plugin-httpfile`, an unrelated package. — [Wiz IOC list: shai-hulud-2-packages.csv](https://github.com/wiz-sec-public/wiz-research-iocs/blob/main/reports/shai-hulud-2-packages.csv), [Datadog IOC list: shai-hulud-2.0/consolidated_iocs.csv](https://github.com/DataDog/indicators-of-compromise/blob/main/shai-hulud-2.0/consolidated_iocs.csv)
- **2026 waves (Unit 42 tracker)**, none naming shiki, @shikijs, antfu, wooorm, unified, remark, rehype, hast, highlight.js or prismjs:
  - Axios compromise (March 2026).
  - @bitwarden/cli@2026.4.0 / "Shai-Hulud: The Third Coming" (2026-04-22, TeamPCP).
  - Mini Shai-Hulud SAP @cap-js wave (2026-04-29).
  - TanStack / Mini Shai-Hulud (2026-05-11): 373 malicious versions across 169 packages, via a `pull_request_target` pwn-request, Actions cache poisoning and OIDC token extraction. The malicious packages carried **valid SLSA L3 provenance**.
  - @antv (2026-05-19): 639 versions across 323 packages after the account "atool" was compromised.
  - Red Hat / Miasma (2026-06-01): 32 packages with valid provenance via orphan commits.
  - AsyncAPI (2026-07-14).
  - Source: [Unit 42: Monitoring npm supply chain attacks](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/)
- **node-gyp worm (June 3, 2026):** 57 packages; execution was hidden in a `binding.gyp` file instead of preinstall hooks. — [Snyk: node-gyp supply chain compromise](https://snyk.io/blog/node-gyp-supply-chain-compromise-self-propagating-npm-worm-binding-gyp/) (search snippet only; page not fetched)
- **"ChainDrop" / keyv (2026-08-04):**
  - A malicious commit to the keyv repo, then `preinstall: node setup.mjs` with a Bun-based stealer.
  - It spread by stolen tokens and pushed `.vscode/tasks.json` and `.claude` hooks.
  - `keyv@6.0.0` had genuine SLSA provenance covering a malicious build.
  - The article does not mention shiki, antfu, wooorm, unified or syntax-tree.
  - Source: [Datadog Security Labs: ChainDrop worm](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)
  - CSA Singapore counts more than 1,300 package versions. — [CSA Singapore AD-2026-009](https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/)
- **@antv (May 2026), Microsoft write-up:** a compromised @antv maintainer account was used for CI/CD credential theft. The "antv" name is unrelated to "antfu". — [Microsoft Security Blog: Mini Shai-Hulud @antv](https://www.microsoft.com/en-us/security/blog/2026/05/20/mini-shai-hulud-compromised-antv-npm-packages-enable-ci-cd-credential-theft/)
- **"SlugFest" trusted-publishing flaw (disclosed 2026-10):**
  - npm Trusted Publishing bound a package to a GitHub owner/repo *slug* and did not check numeric IDs. When a bound repo or owner was renamed, transferred or deleted, an attacker could re-register the name and publish, with valid provenance.
  - More than 1,500 packages were exposed. It was reported 2026-06-06 and validated 2026-06-09. GitHub's change, announced 2026-10-02, expires unvalidated TP configurations after 48 hours.
  - Exploitation in the wild is unknown.
  - Source: [Help Net Security: SlugFest](https://www.helpnetsecurity.com/2026/10/13/slugfest-npm-trusted-publishing-flaw/), [Bloom Security: SlugFest](https://bloom.security/blog/slugfest-millions-of-ai-agents-download-exposed-npm-packages)
- **Registry forensics on Shiki's tree (2026-10-14):**
  - None of the 45 packages has a version listed in `time` but missing from `versions`, the signature left when npm removes a malicious version. The only such entry is `vfile@1.3.0`, from a much older era.
  - Every version of every wooorm package was published by `wooorm`.
  - Every shiki/@shikijs version since 3.12.1 was published by "GitHub Actions" with `trustedPublisher` set.
  - All slevithan packages were published by `slevithan`.
  - Source: [npm registry: shiki](https://registry.npmjs.org/shiki), [vfile](https://registry.npmjs.org/vfile), [unist-util-visit](https://registry.npmjs.org/unist-util-visit)
- **Maintainer concentration:**
  - Of the 26 wooorm-published packages, 8 also list `kmck` as an npm maintainer (hast-util-to-html, hast-util-whitespace, mdast-util-to-hast and unist-util-{is, position, stringify-position, visit, visit-parents}). The other 18 list `wooorm` alone.
  - The 5 slevithan packages have a single maintainer (`slevithan`).
  - `@ungap/structured-clone` (webreflection) and `dequal` (lukeed) are also single-maintainer.
  - Source: [npm registry: hast-util-to-html](https://registry.npmjs.org/hast-util-to-html), [oniguruma-to-es](https://registry.npmjs.org/oniguruma-to-es), [ccount](https://registry.npmjs.org/ccount)
- **npm platform hardening:** after Shai-Hulud, GitHub planned to deprecate classic tokens, cap granular-token lifetimes (7 days, shorter for publishing), require 2FA for local publishing and favour trusted publishing. npm trusted publishing (OIDC) became GA in July 2025. — [GitHub Blog (2025-09-22)](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/)

### Inferences
- **Worm pattern vs this tree.** The 2025–2026 worms spread through (1) install-time hooks (`preinstall`/`postinstall`/`binding.gyp`) and (2) stolen tokens or OIDC access used to republish a victim's other packages. The 45-package tree has no install hooks today. A future malicious version of any wooorm, slevithan or webreflection package could still add one, and the caret ranges would pull it in automatically on a fresh resolve. The defences are a committed lockfile, `--ignore-scripts`, and a soak or cooldown period before adopting new versions (e.g. pnpm `minimumReleaseAge` or npm `--before`).
- **Single-account blast radius.** A compromise of the `wooorm` account alone would reach 26/45 packages here, and thousands of unified, remark, rehype and MDX dependents ecosystem-wide. In the Shai-Hulud model, one stolen credential republishes every package that account owns. That is the main concentration risk. It is structural, not evidence of weakness, and wooorm's packages have no incident history.
- **Provenance is necessary but not sufficient.** TanStack, Red Hat and keyv all shipped malicious versions with valid provenance, and SlugFest showed TP binding flaws. Shiki's trusted publishing raises the bar against stolen *npm tokens*, but not against a compromised GitHub repo, workflow or CI dependency.
- **A specific weak point in Shiki's release workflow.** The workflow triggers on `v*` tag pushes with `id-token: write`, runs a full `pnpm install` of all dev dependencies, runs `npx changelogithub` and `npm i -g npm@latest` in the **same job that publishes**, and references actions by major tag (`@v7`, `@v6`), not by SHA. A compromised dev dependency or npm/changelogithub release that executes during that job could, in principle, mint an OIDC publish token. That is the TanStack technique. This is my inference from the workflow file, not a reported issue. — [shiki: .github/workflows/release.yml](https://github.com/shikijs/shiki/blob/main/.github/workflows/release.yml)
- Shiki's own repo has not been renamed recently, so SlugFest exposure for `shikijs/shiki` seems unlikely. That is an inference; Bloom's list of exposed packages was not checked.

### Gaps
- No full Shai-Hulud 1 (Sept 2025) package list was cross-checked; only Truesec's initial-40 list. The Datadog repo has no SH1 CSV at the guessed path, and Socket's full list was not fetched.
- I did not obtain the 2026 wave IOC lists (TeamPCP, axios, ChainDrop full lists) for an exact name-level cross-check. The "not affected" conclusion for 2026 rests on write-ups not naming these packages, plus the absence of removed or anomalous versions in registry metadata.
- I found no statement from antfu or wooorm about their own account security (hardware 2FA etc.).
- The Hacker News article on SlugFest returned HTTP 403; the details come from Help Net Security and the search summary.

---

## Q5. Maintenance: release cadence, maintainers, funding, provenance and trusted publishing

### Takeaway
Shiki is very actively maintained. It had 23 releases in the last 12 months, and every release since 3.12.1 (2025-09-01) went out through **GitHub Actions trusted publishing with SLSA provenance**; provenance alone goes back to 1.17.4 (Sept 2024). The rest of the tree (wooorm, slevithan, the @shikijs/vscode-textmate fork) is published manually from personal accounts **without provenance**. Funding is individual GitHub Sponsors for Shiki and a modest Open Collective for unified.

### Cited Findings
- **Release cadence and provenance:**
  - Shiki releases between 2025-10-26 and 2026-10-01 were 3.14.0 → 3.23.0 (11 releases), then 4.0.0, 4.0.1, 4.0.2, 4.1.0, 4.2.0, 4.3.0, 4.3.1, 4.4.0, 4.4.1, 4.4.2, 4.4.3 and 4.5.0: about 23 releases.
  - The longest recent gap was 4.0.2 (2026-03-09) to 4.1.0 (2026-05-19).
  - The first version published by "GitHub Actions" was 3.12.1 (2025-09-01). All 27 versions since then have `trustedPublisher` (OIDC) and SLSA v1 provenance attestations. The first version with provenance at all was 1.17.4 (2024-09-12).
  - Source: [npm registry: shiki](https://registry.npmjs.org/shiki)
- `shiki` npm maintainers: antfu, orta, octref and shiki-deploys. The `@shikijs/*` packages list antfu, orta and octref. — [npm registry: shiki](https://registry.npmjs.org/shiki), [@shikijs/core](https://registry.npmjs.org/@shikijs%2fcore)
- `@shikijs/vscode-textmate@10.0.2` (2025-02-15) was published by `antfu` manually, with no provenance. — [npm registry: @shikijs/vscode-textmate](https://registry.npmjs.org/@shikijs%2fvscode-textmate)
- Shiki's GitHub repo: 13.9k stars, 608 forks, 77 open issues, 32 open PRs, MIT. The repo has no SECURITY.md. — [GitHub: shikijs/shiki](https://github.com/shikijs/shiki), [GitHub: shikijs/shiki security](https://github.com/shikijs/shiki/security)
- Shiki `FUNDING.yml`: `github: [antfu, octref]`, i.e. individual GitHub Sponsors and no project-level collective. — [shiki: .github/FUNDING.yml](https://github.com/shikijs/shiki/blob/main/.github/FUNDING.yml)
- Shiki's release workflow: triggered on tag push `v*`, `permissions: id-token: write`, `pnpm install`, `npx changelogithub`, `npm i -g npm@latest`, `pnpm run publish:ci`. — [shiki: .github/workflows/release.yml](https://github.com/shikijs/shiki/blob/main/.github/workflows/release.yml)
- **unified collective (Open Collective):** balance $40,177.78, total raised $191,367.02, estimated annual budget **$29,915.76**. Sponsors include GitHub Sponsors ($74,613 since Oct 2020), Vercel, Gatsby, HashiCorp, GitBook and Netlify. Admins: Titus Wormer (wooorm), John Otander, Christian Murphy and Merlijn Vos. — [Open Collective: unified](https://opencollective.com/unified)
- **wooorm packages in this tree:** none of the versions has provenance. Recent activity: `micromark-util-types@2.0.3` on 2026-09-26, `property-information@7.2.0` on 2026-06-01, `unist-util-visit@5.1.0` on 2026-01-22, `mdast-util-to-hast@13.2.1` on 2025-11-23. `hast-util-to-html@9.0.5` dates from 2025-02-19. — [npm registry: micromark-util-types](https://registry.npmjs.org/micromark-util-types), [hast-util-to-html](https://registry.npmjs.org/hast-util-to-html)
- **slevithan packages:** no provenance. `oniguruma-to-es` 4.3.4 on 2025-11-21, 4.3.5 on 2026-03-15, 4.3.6 on 2026-04-19; `regex@6.1.0` on 2025-12-09. — [npm registry: oniguruma-to-es](https://registry.npmjs.org/oniguruma-to-es), [regex](https://registry.npmjs.org/regex)

### Inferences
- Shiki's core team is small (3 npm maintainers, with antfu as the dominant publisher historically: 126 of the pre-TP shiki versions), but the project is clearly healthy and fast-moving.
- High cadence cuts both ways for a pinned build tool. Fixes ship quickly, but frequent new versions mean frequent fresh code. A lockfile plus a cooldown on upgrades is advisable.
- The lack of SECURITY.md means there is no documented private disclosure channel or supported-version policy. In practice, only the latest 4.x appears to be maintained (inference from the release history; 3.x stopped at 3.23.0).

### Gaps
- The contributor count for shiki could not be read (the GitHub contributor widget was empty and the API was rate-limited).
- I found no data on antfu's or octref's GitHub Sponsors income, nor on whether any org (e.g. Vercel, Nuxt) funds Shiki directly.
- I did not verify whether wooorm uses 2FA or hardware keys; npm metadata does not expose this.

---

## Q6. highlight.js and Prism as alternatives: advisories, dependencies, maintenance, custom-language suitability

### Takeaway
Both alternatives are **single packages with zero runtime dependencies**: highlight.js 11.12.0 is 5.5 MB unpacked, Prism 1.30.0 is 2.05 MB. That makes for a much smaller supply-chain surface than Shiki's 45 packages. Both have more advisory history:
- highlight.js: 2 old GHSAs (2020), plus an Aug 2026 ReDoS fix in a grammar.
- Prism: 6 CVEs from 2020–2025, the latest being CVE-2024-53382 DOM clobbering, fixed in 1.30.0.

highlight.js is active again; it resumed releases in Aug 2026 with trusted publishing and provenance. Prism v1 is effectively frozen (security-only PRs) while v2 is in alpha (2.0.0-alpha.1, 2026-09-08). Neither consumes TextMate grammars, so a custom language would have to be rewritten in their JS/regex DSL.

### Cited Findings
- **highlight.js npm:** `latest: 11.12.0` (2026-08-12), with 11.11.2 on 2026-08-11 before it. The previous release was 11.11.1 on 2024-12-25, a **~20-month gap**. Zero dependencies, 5,503,982 B unpacked, no install scripts. 11.11.2 and 11.12.0 were published by "GitHub Actions" with `trustedPublisher` and provenance; these are the first highlight.js versions with provenance. npm maintainers: marcosc, joshgoebel, isagalaev, highlightjs_bot. — [npm registry: highlight.js](https://registry.npmjs.org/highlight.js)
- **highlight.js advisories:**
  - **GHSA-7wwv-vh3v-89cq**, "ReDOS vulnerabilities: multiple grammars": affected 9.0.0 to <10.4.1, fixed 10.4.1, published 2020-12-04, moderate. — [GHSA-7wwv-vh3v-89cq](https://github.com/advisories/GHSA-7wwv-vh3v-89cq)
  - **CVE-2020-26237 / GHSA-vfrc-7r7c-w9mx**, prototype pollution: fixed in 9.18.2 and 10.1.2, published 2020-11-24, moderate. — [GHSA-vfrc-7r7c-w9mx](https://github.com/advisories/GHSA-vfrc-7r7c-w9mx)
  - No advisories against 11.x in OSV. — [OSV.dev](https://osv.dev/list?ecosystem=npm&q=highlight.js)
- **highlight.js 11.12.0 changelog** includes "fix(c, cpp) bound the run of type tokens in front of a function name (ReDoS), issue #4362". That is a grammar-level ReDoS fixed without an advisory. — [highlight.js CHANGES.md](https://github.com/highlightjs/highlight.js/blob/main/CHANGES.md)
- **highlight.js SECURITY.md:** "the Highlight.js core team fully supports only the current major/minor release". 11.x "receives regular updates, new features & security fixes". 10.7.x is unsupported, "<= 10.4.0 Known vulnerabilities", and 9.18.5 and below are EOL. Reports go through GitHub issues or security@highlightjs.org. — [highlight.js SECURITY.md](https://github.com/highlightjs/highlight.js/blob/main/SECURITY.md)
- The current highlight.js README contains **no "maintenance mode" notice**. It describes 180+ core languages plus third-party grammars. CONTRIBUTING says "The core team generally doesn't implement new languages", so third-party grammars are the expected route. — [highlight.js README](https://github.com/highlightjs/highlight.js/blob/main/README.md), [highlight.js CONTRIBUTING.md](https://github.com/highlightjs/highlight.js/blob/main/CONTRIBUTING.md)
- **highlight.js custom languages:** "A language definition is a JavaScript object describing the default parsing mode". Modes use `begin`/`end`/`illegal` regexes and `contains` arrays. Look-behind is disallowed in `begin` (Safari support). The language guide does not discuss ReDoS. — [highlight.js Language definition guide](https://highlightjs.readthedocs.io/en/latest/language-guide.html)
- **Prism npm:** `latest: 1.30.0` (2025-03-10), previous 1.29.0 (2022-08-23). `alpha: 2.0.0-alpha.1` was published 2026-09-08 (6.54 MB unpacked, 0 dependencies). Prism 1.30.0 has 0 dependencies, 2,052,735 B unpacked, no provenance, and was published by `dmitrysharabin`. npm maintainers: leaverou, rdy, vinsonchuong, gpleiss, jamesdigioia, golmote, rundevelopment, dmitrysharabin. Registry `time` also shows removed versions `9000.0.1` and `9000.0.2`; their cause was not investigated. — [npm registry: prismjs](https://registry.npmjs.org/prismjs)
- **Prism README:** "We are currently working on Prism v2 and will only accept security-relevant PRs for the time being." — [PrismJS README](https://github.com/PrismJS/prism/blob/master/README.md)
- **Prism SECURITY.md:** ReDoS is "the main type[s] of vulnerabilities reported". Worst-case ≥O(n³) is treated as high severity; O(n²) "moving" slowness is treated as a bug, not a vulnerability. Report by email to maintainers, with a response within 3 days. — [PrismJS SECURITY.md](https://github.com/PrismJS/prism/blob/master/SECURITY.md)
- **Prism advisories (OSV):**
  - CVE-2020-15138 / GHSA-wvhm-4hhf-97x9: XSS, 1.1.0 to <1.21.0, High, 2020-08-07. — [GHSA-wvhm-4hhf-97x9](https://github.com/advisories/GHSA-wvhm-4hhf-97x9)
  - CVE-2021-23341 / GHSA-h4hr-7fg3-h35w: DoS (ReDoS), fixed 1.23.0, High, 2021-03-01. — [GHSA-h4hr-7fg3-h35w](https://github.com/advisories/GHSA-h4hr-7fg3-h35w)
  - CVE-2021-32723 / GHSA-gj77-59wh-66hg: ReDoS, fixed 1.24.0, High, 2021-06-28. — [GHSA-gj77-59wh-66hg](https://github.com/advisories/GHSA-gj77-59wh-66hg)
  - CVE-2021-3801 / GHSA-hqhp-5p83-hx96: ReDoS, fixed 1.25.0, Moderate, 2021-09-20. — [GHSA-hqhp-5p83-hx96](https://github.com/advisories/GHSA-hqhp-5p83-hx96)
  - CVE-2022-23647 / GHSA-3949-f494-cm99: XSS (command-line plugin), 1.14.0 to <1.27.0, High, 2022-02-22. — [GHSA-3949-f494-cm99](https://github.com/advisories/GHSA-3949-f494-cm99)
  - **CVE-2024-53382 / GHSA-x7hr-w5r2-h6wg**: DOM clobbering. NVD: "Prism (aka PrismJS) through 1.29.0 allows DOM Clobbering (with resultant XSS for untrusted input that contains HTML but does not directly contain JavaScript), because document.currentScript lookup can be shadowed by attacker-injected HTML elements". CVSS 3.1 4.9 Medium, fixed 1.30.0, GHSA published 2025-03-03. — [NVD CVE-2024-53382](https://nvd.nist.gov/vuln/detail/CVE-2024-53382), [GHSA-x7hr-w5r2-h6wg](https://github.com/advisories/GHSA-x7hr-w5r2-h6wg)
- **Prism custom languages:** `Prism.languages['some-language'] = { 'token-name': /regex/ }` with `pattern`, `lookbehind`, `greedy`, `alias` and `inside`, plus `extend`/`insertBefore`. Node.js uses `loadLanguages`. The docs warn only about recursive grammars causing "infinite recursion which will cause a stack overflow", with no ReDoS guidance. — [Prism: Extending Prism](https://prismjs.com/extending.html)
- Downstream wrappers `refractor` (Prism) and `lowlight` (highlight.js) have 0 OSV advisories. — [OSV.dev](https://osv.dev/list?ecosystem=npm&q=lowlight)

### Inferences
- **Supply chain.** A 1-package, 0-dependency footprint (highlight.js or Prism) beats Shiki's 45 packages, 4 publisher accounts and 26 single-account wooorm packages. highlight.js additionally has trusted publishing and provenance since Aug 2026, which Prism does not.
- **Vulnerability history.** Most highlight.js and Prism advisories are ReDoS or browser-side XSS/DOM issues. The XSS/DOM ones (CVE-2024-53382, CVE-2022-23647, CVE-2020-15138) arise from running the library in a browser on untrusted HTML, which does not apply to build-time use on trusted snippets. ReDoS is inherent to every regex-based highlighter, Shiki included; Shiki simply has no ReDoS advisories on record.
- **Custom language suitability.** If the author already has (or wants) a TextMate grammar for their language, e.g. shared with a VS Code extension, Shiki uses it directly. highlight.js or Prism would need a hand-written re-implementation in their JS DSL, and loading a JS language definition means executing code, not parsing data. Shiki's output also has higher fidelity (VS Code themes, scope-accurate tokens).
- **Maintenance.** highlight.js is active but has shown long dormant periods (Dec 2024 to Aug 2026). Prism v1 is frozen at 1.30.0 and v2 is only alpha. Shiki is the most actively released of the three.
- **For an offline single-HTML output,** all three can run at build time and emit static HTML with no runtime JS. Prism's DOM-clobbering class of bugs is irrelevant when nothing ships to the browser.

### Gaps
- I did not verify any statement that highlight.js was in "maintenance mode". The current README has none, and I did not search archived README versions or maintainer posts from 2023–2025.
- Prism v2's roadmap, timeline and maintainer count for 2026 were not researched beyond the README notice and the 2.0.0-alpha.1 registry entry.
- I did not investigate the cause of the removed `prismjs` versions `9000.0.1`/`9000.0.2` seen in registry `time`; they might be a historical squatting or test publish.
- No Snyk-only advisories for highlight.js or Prism were checked.
