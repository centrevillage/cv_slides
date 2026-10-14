# Security posture of yaml, sharp, katex, CodeMirror 6 and BMP→PNG options (as of 2026-10-14)

Method note: registry facts (latest versions, publish dates, dependencies, install scripts, publisher and attestations) come from the live npm registry JSON fetched on 2026-10-14. Advisory lists come from the OSV.dev query API (`POST https://api.osv.dev/v1/query`, ecosystem npm), which mirrors GitHub Advisory Database (GHSA) and OpenSSF malicious-package (MAL-) records. Dependency counts were computed by resolving each package's declared dependency ranges to the newest matching registry version, for a darwin-arm64 host. They are approximations of a fresh install, not lockfile output. Nothing was installed or run.

## Q1. `yaml` (eemeli/yaml) — advisories, version, dependencies, maintenance; comparison with `js-yaml` / gray-matter

### Takeaway
`yaml` is zero-dependency and actively maintained (2.9.1 released 2026-09-11). It has two advisories, both DoS-class: CVE-2023-2251 (fixed 2.2.2) and CVE-2026-33532 (stack overflow from deep nesting, fixed 2.8.3 / 1.10.3). Neither matters much when parsing the author's own front matter. `js-yaml` has a much heavier advisory record: a prototype-pollution bug in 2025, then about eight CPU-DoS advisories from June to September 2026. gray-matter has not been published since 2021 and pulls in js-yaml 3.x plus 9 other packages, so `yaml` is the lower-risk choice.

### Cited Findings
- **Current release:** latest is `yaml@2.9.1`, published 2026-09-11. The `next` tag is `3.0.0-2`, also published 2026-09-11. Recent releases: 2.8.3 and 1.10.3 (both 2026-03-21), 2.8.4 (2026-05-02), 2.9.0 (2026-05-11) — [npm registry: yaml](https://registry.npmjs.org/yaml)
- **Footprint and publishing:** `yaml@2.9.1` has no `dependencies` and no install/preinstall/postinstall scripts. License ISC, `engines.node >= 14.6`, unpacked size about 686 KB (233 files). The only npm maintainer is `eemeli`, who publishes from a personal account. None of the 105 published versions carries an npm provenance attestation — [npm registry: yaml](https://registry.npmjs.org/yaml)
- **CVE-2023-2251 / GHSA-f9xv-q969-pqx4:** "Uncaught Exception", CVSS 3.1 7.5 (HIGH), CWE-248. Affects 2.0.0-5 up to (not including) 2.2.2, fixed in 2.2.2. Published 2023-04-24 and reported via huntr.dev — [OSV GHSA-f9xv-q969-pqx4](https://osv.dev/vulnerability/GHSA-f9xv-q969-pqx4); [NVD CVE-2023-2251](https://nvd.nist.gov/vuln/detail/CVE-2023-2251)
- **CVE-2026-33532 / GHSA-48c2-rrv3-qjmp:** stack overflow via deeply nested YAML collections, MODERATE (CVSS 3.1 AV:N/AC:L/PR:L/…/A:L), CWE-674. Affects 1.0.0–<1.10.3 and 2.0.0–<2.8.3. Published 2026-03-25; the fix releases came out 2026-03-21. A payload of about 2–10 KB (for example 5,000 nested `[`) throws `RangeError: Maximum call stack size exceeded` rather than `YAMLParseError`. `parse()`, `parseDocument()` and `parseAllDocuments()` are all affected; the CST `Parser` is not — [GHSA-48c2-rrv3-qjmp (eemeli/yaml)](https://github.com/eemeli/yaml/security/advisories/GHSA-48c2-rrv3-qjmp); [OSV](https://osv.dev/vulnerability/GHSA-48c2-rrv3-qjmp)
- **No other yaml records:** OSV lists only those two advisories for npm `yaml`, and no MAL- (malicious-version) record — [OSV query for npm/yaml](https://osv.dev/list?ecosystem=npm&q=yaml)
- **js-yaml current state:** latest `js-yaml@5.4.3`, published 2026-10-05. Legacy lines are still patched under dist-tags `v4-legacy` = 4.3.2 and `v3-legacy` = 3.15.2 (both 2026-08-26). It has one runtime dependency, `argparse ^2.0.1`. The only maintainer and publisher is `vitaly`, and none of its 92 versions has provenance — [npm registry: js-yaml](https://registry.npmjs.org/js-yaml)
- **js-yaml CVE-2025-64718 / GHSA-mh29-5h37-fv8m:** the 2025 merge-key advisory you asked about. Prototype pollution via `__proto__` in the merge (`<<`) key, MODERATE. Affects 4.0.0–4.1.0 and ≤3.14.1, fixed in 4.1.1 and 3.14.2. Published 2025-11-14. Suggested workaround: `node --disable-proto=delete` — [GHSA-mh29-5h37-fv8m](https://github.com/nodeca/js-yaml/security/advisories/GHSA-mh29-5h37-fv8m); [OSV](https://osv.dev/vulnerability/GHSA-mh29-5h37-fv8m)
- **js-yaml 2026 DoS wave**, per [OSV query for npm/js-yaml](https://osv.dev/list?ecosystem=npm&q=js-yaml):
  - CVE-2026-53550 / GHSA-h67p-54hq-rp68: quadratic merge-key DoS. Published 2026-06-15; fixed 4.2.0 and 3.15.0.
  - CVE-2026-59869 / GHSA-52cp-r559-cp3m: merge-key chains. HIGH, published 2026-07-20; fixed 4.3.0 and 3.15.0.
  - CVE-2026-59868 / GHSA-g796-fgmg-93mv: the same issue in 5.x. Fixed 5.2.0.
  - CVE-2026-59870 / GHSA-724g-mxrg-4qvm: `!!omap` O(n²). 5.x fixed 5.2.1. GHSA-5p4m-2wfm-xmqj backported the fix to 4.3.1 and 3.15.1 (published 2026-08-06).
  - CVE-2026-73643 / GHSA-pm4m-ph32-ghv5: exponential parse time in flow collections. HIGH, 5.x fixed 5.2.2.
  - CVE-2026-84375 / GHSA-2883-xcg3-v3hh: `maxTotalMergeKeys` does not count empty merge sources. HIGH, published 2026-09-08; fixed 4.3.2 and 3.15.2.
  - GHSA-r3ph-w7gj-g6xm: the same issue in 5.x. Fixed 5.4.1 (2026-09-29).
- **Older js-yaml advisories:** CVE-2013-4660 (code execution, <2.0.5) and GHSA-8j8c-7jfh-h6hx (code injection, <3.13.1, 2019) — [OSV query for npm/js-yaml](https://osv.dev/list?ecosystem=npm&q=js-yaml)
- **Why v3/v4 are rated higher:** the GHSA-2883 advisory states "In v3 & v4, merge is enabled by default. So, the severity score is higher." (implying v5 does not enable merge by default) — [GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)
- **gray-matter:** latest is still `gray-matter@4.0.3`, published 2021-04-24. It depends on `js-yaml ^3.13.1`, `kind-of`, `section-matter` and `strip-bom-string`. Maintainers: jonschlinkert, doowb, rmassaioli — [npm registry: gray-matter](https://registry.npmjs.org/gray-matter)
- **gray-matter resolved tree:** today it resolves to 10 packages (argparse@1.0.10, esprima@4.0.1, extend-shallow@2.0.1, is-extendable, js-yaml@3.15.2, kind-of@6.0.3, section-matter@1.0.0, sprintf-js, strip-bom-string). js-yaml lands on the patched 3.15.2 only because `^3.13.1` floats — computed from [npm registry: gray-matter](https://registry.npmjs.org/gray-matter) and [js-yaml](https://registry.npmjs.org/js-yaml) metadata

### Inferences
- All `yaml` advisories are DoS or uncaught-exception issues triggered by hostile YAML. The generator parses only the author's own front matter, so practical exposure is close to nil. Pin `^2.9.1` (≥2.8.3 is enough to clear both CVEs) and catch generic `Error`, not only `YAMLParseError`, because CVE-2026-33532 throws `RangeError`.
- gray-matter has been abandoned since 2021 and uses js-yaml 3.x, which only receives "legacy" patches. A lockfile created before 2026-08-26 could pin a js-yaml 3.x that is vulnerable to the 2026 DoS advisories. Parsing `---` front matter yourself with `yaml` avoids 10 packages, and the parsing is trivial.

### Gaps
- No SECURITY.md content or disclosure-response SLA for eemeli/yaml was retrieved.
- The fix-to-advisory lag for CVE-2026-33532 is about 4 days (release 2026-03-21, advisory 2026-03-25). Report-to-fix time is unknown.
- I believe gray-matter supports `---js` / `---javascript` front matter executed with `eval`, but I did not verify this in its source here. Check it before adopting gray-matter.

## Q2. `sharp` — installation mechanism, native-code exposure, advisories, libvips patch cadence, footprint

### Takeaway
sharp 0.35.x (latest 0.35.5, 2026-09-27) has no npm lifecycle scripts. It ships prebuilt native binaries as per-platform optional packages (`@img/sharp-<platform>` plus `@img/sharp-libvips-<platform>`, about 18 MB on darwin-arm64), all published with npm trusted publishing and SLSA provenance. A darwin-arm64 install pulls 6 packages in total. Its advisories are almost all inherited from bundled C libraries:
- libwebp CVE-2023-4863, fixed in 0.32.6
- libvips CVEs, fixed in 0.35.0
- libheif, fixed in 0.35.4 (possible RCE)
- librsvg CVE-2026-96889, fixed in 0.35.5 (possible RCE)

The project ships patched binaries promptly and offers `sharp.block()` to disable the risky decoders. Risk is low for the author's own JPEG/PNG photos. The main cost is a large native binary you have to keep updated.

### Cited Findings
- **Current release:** latest `sharp@0.35.5`, published 2026-09-27; the `next` tag is also 0.35.5. Runtime deps: `semver ^7.8.5`, `@img/colour ^1.1.0`, `detect-libc ^2.1.2`. There are 25 `optionalDependencies` covering 14 `@img/sharp-*` platform packages (darwin, linux glibc/musl, win32, plus `freebsd-wasm32` and `webcontainers-wasm32`) and 11 `@img/sharp-libvips-*` packages. `scripts` has no install/preinstall/postinstall entry. `engines.node >= 20.9.0`, license Apache-2.0, maintainer `lovell` — [npm registry: sharp](https://registry.npmjs.org/sharp)
- **Install-script history:**
  - 0.32.x ran `install: (node install/libvips && node install/dll-copy && prebuild-install) || (node install/can-compile && node-gyp rebuild …)` and downloaded libvips at install time. 0.32.6 bundled libvips 8.14.5.
  - 0.33.0 (2023-11-29) switched to `install: node install/check`.
  - 0.34.5 (2025-11-06) used `install: node install/check.js || npm run build`.
  - 0.35.0 (2026-06-10) and later have no install script.
  - Source: version entries in [npm registry: sharp](https://registry.npmjs.org/sharp)
- **Platform packages:** `@img/sharp-darwin-arm64@0.35.5` has no scripts and is about 292 KB. Its only dependency is optional, `@img/sharp-libvips-darwin-arm64@1.3.4`, which is about 18.2 MB unpacked, licensed LGPL-3.0-or-later, built from the `lovell/sharp-libvips` repo, and also has no scripts — [npm registry: @img/sharp-darwin-arm64](https://registry.npmjs.org/@img/sharp-darwin-arm64); [@img/sharp-libvips-darwin-arm64](https://registry.npmjs.org/@img/sharp-libvips-darwin-arm64)
- **Minimum libvips:** `config.libvips` is ">=8.18.3" in 0.35.0 and 0.35.3, ">=8.18.6" in 0.35.4 and ">=8.18.7" in 0.35.5 — [npm registry: sharp](https://registry.npmjs.org/sharp)
- **Resolved tree on darwin-arm64:** 6 packages: sharp@0.35.5, semver@7.8.5, @img/colour@1.1.0, detect-libc@2.1.2, @img/sharp-darwin-arm64@0.35.5, @img/sharp-libvips-darwin-arm64@1.3.4 — computed from [npm registry: sharp](https://registry.npmjs.org/sharp) metadata
- **Install docs:**
  - Package managers "will automatically select prebuilt binaries for the current OS platform and CPU architecture", and the page tells you to ensure "your package manager is configured to install optional dependencies".
  - Building from source looks for a globally installed libvips and needs a C++17 compiler, node-addon-api 7+ and node-gyp 9+. `SHARP_IGNORE_GLOBAL_LIBVIPS` and `SHARP_FORCE_GLOBAL_LIBVIPS` control libvips detection.
  - An optional `@img/sharp-wasm32` WebAssembly build exists.
  - Prebuilt binaries support JPEG, PNG, Ultra HDR, WebP, AVIF, TIFF, GIF and SVG (input). BMP is not in the list.
  - Requirement: "Node-API v9 compatible runtime e.g. Node.js >= 20.9.0."
  - Source: [sharp install docs](https://sharp.pixelplumbing.com/install)
- **CVE-2023-4863 / GHSA-54xq-cgqr-rpm3** (sharp's own advisory for the libwebp heap overflow, upstream GHSA-j7hp-h8jx-5ppr): HIGH. Affects all versions before 0.32.6, which ships libwebp 1.3.2. sharp 0.32.6 was published 2023-09-18; the sharp advisory itself was published 2023-11-16. Workaround: `sharp.block({ operation: ["VipsForeignLoadWebp"] })` — [GHSA-54xq-cgqr-rpm3](https://github.com/lovell/sharp/security/advisories/GHSA-54xq-cgqr-rpm3); release date from [npm registry: sharp](https://registry.npmjs.org/sharp)
- **GHSA-f88m-g3jw-g9cj** (inherited libvips CVE-2026-33327, -33328, -35590, -35591): HIGH (CVSS v4), "two rated as High". Affects <0.35.0, and the advisory points users to 0.35.3 with libvips 8.18.3. Published 2026-07-21; 0.35.0 had been released on 2026-06-10. Workaround: block `VipsForeignLoadNsgif`, `VipsForeignLoadTiff` and `VipsForeignLoadVips` — [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj); [OSV](https://osv.dev/vulnerability/GHSA-f88m-g3jw-g9cj)
- **GHSA-rgj7-g3m4-5g8c** (libheif GHSA-g89c-p67h-r497 = CVE-2026-84383, and GHSA-2jg2-4ch7-h545): upstream rates two of them Critical (CVSSv3). sharp says they "can lead to possible remote code execution (RCE) on glibc-based Linux" and down-rates to High under CVSSv4 because sharp has no networking. Fixed in 0.35.4 (2026-08-26) with libheif 1.23.2; advisory published 2026-09-08. Workaround: block `VipsForeignLoadHeif` (AVIF). The advisory also warns that official Node.js binaries are not built as PIE — [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c)
- **GHSA-wq5f-xc86-pv6w** (librsvg CVE-2026-96889, use-after-free class, CWE-416): "possible remote code execution (RCE) on glibc-based Linux". Fixed in 0.35.5 (2026-09-27) with librsvg 2.63.2; advisory published 2026-10-06. Workaround: block `VipsForeignLoadSvg` — [GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
- **CVE-2022-29256 / GHSA-gp95-ppv5-3jc5:** command injection in install-time logic through an attacker-controlled `PKG_CONFIG_PATH`, MODERATE. Fixed 0.30.5. Historical only, since current versions have no install script — [GHSA-gp95-ppv5-3jc5](https://github.com/lovell/sharp/security/advisories/GHSA-gp95-ppv5-3jc5)
- **Scope and other records:**
  - Each of the four libvips/libheif/librsvg advisories is scoped to "those processing untrusted input" — [GHSA-f88m-g3jw-g9cj](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj); [GHSA-54xq-cgqr-rpm3](https://github.com/lovell/sharp/security/advisories/GHSA-54xq-cgqr-rpm3)
  - OSV has no advisories or MAL- records for `@img/sharp-darwin-arm64`, `@img/sharp-libvips-darwin-arm64`, `@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`, `@img/sharp-win32-x64`, `@img/colour` or `detect-libc` — [OSV.dev](https://osv.dev/list?ecosystem=npm&q=%40img%2Fsharp)
  - `semver` has two old ReDoS advisories (CVE-2022-25883, fixed 7.5.2; CVE-2015-8855). The resolved 7.8.5 is newer than those fixes — [GHSA-c2qf-rxjj-qqgw](https://github.com/advisories/GHSA-c2qf-rxjj-qqgw)
- **Release cadence:** recent sharp releases are 0.35.3 (2026-07-01), 0.35.4 (2026-08-26) and 0.35.5 (2026-09-27), each with rc builds a few days earlier — [npm registry: sharp](https://registry.npmjs.org/sharp)

### Inferences
- **Install-time risk:** with no lifecycle scripts since 0.35.0, nothing executes at `npm install`. The native code runs only when sharp is `require`d. The exposure is native-library memory-safety bugs reached through image decoding.
- **Cadence:** the four bundled-library advisories since 2023 show a pattern. sharp ships a patched binary first (0.32.6, 0.35.0, 0.35.4, 0.35.5), and the GHSA follows days to weeks later (about 9 days for librsvg, about 13 for libheif, about 6 weeks for libvips, about 2 months for libwebp). Watching sharp releases is more timely than watching advisories.
- **Image trust:** the photos are the author's own, so the "untrusted input" precondition mostly does not apply. Images downloaded from the web and dropped into the deck are a residual risk. A defensive configuration is to allowlist formats: `sharp.block({ operation: ["VipsForeignLoadSvg", "VipsForeignLoadHeif", "VipsForeignLoadTiff", "VipsForeignLoadNsgif", "VipsForeignLoadVips"] })`, keeping only JPEG/PNG/WebP decoders. This blocks every decoder named in the 2026 advisories.
- **Keep it optional:** sharp can stay an `optionalDependency` with the CLI degrading gracefully, because platform packages can fail to install when optional deps are disabled.

### Gaps
- Upstream disclosure dates for the libvips 2026 CVEs, libheif and librsvg CVE-2026-96889 were not retrieved, so the upstream-fix-to-sharp-release lag (as opposed to release-to-GHSA lag) is not measured.
- The exact libwebp/libpng/libjpeg-turbo versions bundled in `@img/sharp-libvips-*@1.3.4` were not retrieved; the sharp-libvips `versions.json` was not fetched.
- The sharp SECURITY.md and the "Security" section of the docs were not retrieved; the install page only links to it.
- The NVD disclosure date for CVE-2023-4863 (believed to be about 11–12 Sept 2023) was not re-verified in this session.

## Q3. `katex` — advisories, `trust`/`strict`, version, dependencies, maintenance, MathML vs HTML output

### Takeaway
KaTeX 0.19.0 (2026-10-01) is actively maintained. It has one runtime dependency (`commander`, used for the CLI) and no install scripts. Its six GHSA advisories are XSS or DoS issues that matter when rendering untrusted math. Four came in March 2024 (fixed 0.16.10), one in January 2025 (`\htmlData`, fixed 0.16.21) and one in October 2026 (a prototype-pollution gadget that can flip `trust`, fixed 0.18.2). Rendering the author's own math at build time with `trust: false` (the default) and pinning ≥0.18.2 leaves little practical risk.

### Cited Findings
- **Current release:** latest `katex@0.19.0`, published 2026-10-01. Its only dependency is `commander ^15.0.0`. The only script is `prepare: husky`, which is a dev-time hook; there are no install scripts. Unpacked size about 4.0 MB (225 files). npm maintainers: xymostech, gagern, kevinbarabash, edemaine, khanacademy, sophiebits, ylemkimon; the latest releases were published by `edemaine`. Eight releases between 2026-08-31 (0.18.5) and 2026-10-01 (0.19.0). None of its 127 versions has a provenance attestation — [npm registry: katex](https://registry.npmjs.org/katex)
- **Resolved tree:** 2 packages (katex@0.19.0 and commander@15.0.0). OSV has no records for `commander` — computed from [npm registry: katex](https://registry.npmjs.org/katex); [OSV](https://osv.dev/list?ecosystem=npm&q=commander)
- **March 2024 batch** (all published 2024-03-25, all MODERATE, all fixed in 0.16.10):
  - CVE-2024-28243 / GHSA-64fm-8hw2-v72w: `maxExpand` bypassed by `\edef`; affects 0.12.0–<0.16.10 — [OSV GHSA-64fm-8hw2-v72w](https://osv.dev/vulnerability/GHSA-64fm-8hw2-v72w)
  - CVE-2024-28244 / GHSA-cvr6-37gx-v8wc: `maxExpand` bypassed by Unicode sub/superscripts; affects 0.15.4–<0.16.10 — [OSV GHSA-cvr6-37gx-v8wc](https://osv.dev/vulnerability/GHSA-cvr6-37gx-v8wc)
  - CVE-2024-28245 / GHSA-f98w-7cxr-ff2h: `\includegraphics` does not escape its filename, so malicious input can run JavaScript. Affects 0.11.0–<0.16.10. Workarounds: turn off `trust` or forbid `\includegraphics` — [GHSA-f98w-7cxr-ff2h](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-f98w-7cxr-ff2h)
  - CVE-2024-28246 / GHSA-3wc5-fcw2-2329: protocol not normalized, so a `trust` function that block-lists `javascript` can be bypassed with uppercase (`JavaScript:`). Affects 0.11.0–<0.16.10. The advisory recommends allow-listing protocols — [GHSA-3wc5-fcw2-2329](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-3wc5-fcw2-2329)
- **Correction to the brief:** `\htmlData` was not part of the March 2024 batch. It is CVE-2025-23207 / GHSA-cg87-wmx4-v546, published 2025-01-17: attribute names were not validated, allowing script-running HTML via `renderToString`. Affects 0.12.0–<0.16.21, fixed 0.16.21. Workarounds: disable `trust` or forbid `\htmlData` — [GHSA-cg87-wmx4-v546](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-cg87-wmx4-v546)
- **CVE-2026-103923 / GHSA-238p-pmpm-9mq7:** "Existing prototype pollution can bypass trust restrictions", LOW (CVSS v4). Affects 0.11.0–<0.18.2, fixed 0.18.2; published 2026-10-05. If `Object.prototype.trust` has already been polluted by some other bug, KaTeX treats it as `trust: true`. KaTeX itself does not cause the pollution — [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7)
- **No other katex records:** OSV lists exactly these six advisories and no MAL- record — [OSV query for npm/katex](https://osv.dev/list?ecosystem=npm&q=katex)
- **Options** (docs for v0.19.0):
  - `output`: `html`, `mathml`, or `htmlAndMathml` (the default; "includes MathML for accessibility").
  - `trust`: default `false`; when false it prevents "any commands like `\includegraphics` that could enable adverse behavior". A function form `handler(context)` covers `\url`, `\href`, `\includegraphics`, `\htmlClass`, `\htmlId`, `\htmlStyle` and `\htmlData`.
  - `strict`: default `"warn"`; `true`/`"error"` throws, `false`/`"ignore"` allows.
  - `maxExpand`: default 1000.
  - `maxSize`: default `Infinity`.
  - `throwOnError`: default `true`.
  - Source: [KaTeX options](https://katex.org/docs/options)

### Inferences
- **Which advisories apply:** with `trust: false` (default), the XSS-class advisories (CVE-2024-28245, CVE-2024-28246, CVE-2025-23207, CVE-2026-103923) need either trust enabled or prototype pollution elsewhere. Only the `maxExpand` bypasses (DoS) apply to default settings, and they only matter for hostile input. For the author's own math at build time, the residual risk is negligible. Pin ≥0.18.2 to clear everything.
- **Settings to use:** keep `trust: false` and set `maxSize` to something finite, for example 10. `strict: "warn"` or `"error"` is a correctness choice, not a security one.
- **MathML-only vs HTML:** `output: "mathml"` avoids embedding KaTeX's CSS and web fonts in the single HTML file, and emits no HTML `class`/`style` scaffolding. The trust-gated commands (`\href`, `\url`) still exist in either mode, so the security difference is small once `trust` stays false. MathML-only rendering depends on browser MathML Core support (now in Chrome/Edge 109+, Firefox and Safari), and its visual fidelity is lower than HTML output.
- **Maintenance:** maintenance looks healthy (eight releases in about a month, fast advisory turnaround). Publishing still uses personal npm accounts without provenance.

### Gaps
- KaTeX's dedicated Security docs page and SECURITY.md were not retrieved.
- The browser MathML support statement above is background knowledge, not cited in this session.
- I did not verify exactly which trust-gated commands emit attributes in MathML output (for example `href` on `<mrow>`).
- The 0.19.0 changelog (breaking changes, any silent security fixes) was not reviewed.

## Q4. CodeMirror 6 (`@codemirror/*`, `@lezer/*`, `style-mod`, `w3c-keyname`, `crelt`) — advisories, maintainer concentration, bundle size, compromise history

### Takeaway
No CodeMirror 6 or Lezer package, nor any of its micro-dependencies, has any GHSA/OSV advisory or malicious-version record. The only CodeMirror CVE belongs to the legacy v5 `codemirror` package (CVE-2020-7760 ReDoS, fixed 5.58.2). The editor plus a JS language mode is about 18 packages with zero third-party dependencies. Every package is published by one person (npm user `marijn`, Marijn Haverbeke) from a personal account without provenance, so a single account takeover would compromise the whole stack. Basic setup plus a language mode costs about 135 KB gzipped (about 400 KB minified).

### Cited Findings
- **Maintainer and publishing:** every package checked has exactly one npm maintainer, `marijn` (marijn@haverbeke.berlin), who publishes all recent versions personally; no checked version has provenance. Packages checked: `codemirror`, `@codemirror/view`, `state`, `language`, `commands`, `lang-javascript`, `@lezer/common`, `lr`, `highlight`, `javascript`, `style-mod`, `w3c-keyname`, `crelt`, `@marijn/find-cluster-break`. Version counts: `codemirror` 0 of 155 with provenance, `@codemirror/view` 0 of 259 — [npm registry: @codemirror/view](https://registry.npmjs.org/@codemirror/view); [codemirror](https://registry.npmjs.org/codemirror); [style-mod](https://registry.npmjs.org/style-mod); [crelt](https://registry.npmjs.org/crelt); [w3c-keyname](https://registry.npmjs.org/w3c-keyname)
- **Source hosting:** the `repository` field of `@codemirror/view`, `state`, `language`, `commands`, all `@lezer/*` packages, `style-mod`, `crelt` and `@marijn/find-cluster-break` now points to `code.haverbeke.berlin`, a self-hosted forge. `codemirror`, `@codemirror/lang-javascript` and `w3c-keyname` still point to github.com — [npm registry: @codemirror/view](https://registry.npmjs.org/@codemirror/view); [@lezer/common](https://registry.npmjs.org/@lezer/common); [@codemirror/lang-javascript](https://registry.npmjs.org/@codemirror/lang-javascript)
- **Current versions and activity:**
  - `@codemirror/view@6.43.14` (2026-10-07); 8 releases between 2026-07-27 and 2026-10-07
  - `@codemirror/state@6.7.6` (2026-09-22)
  - `@codemirror/language@6.13.1` (2026-10-07)
  - `@codemirror/commands@6.11.1` (2026-09-15)
  - `@codemirror/lang-javascript@6.2.5` (2026-03-02)
  - `@lezer/javascript@1.5.6` (2026-10-01)
  - `@lezer/lr@1.4.11` (2026-10-07)
  - `@lezer/common@1.5.3` (2026-09-24)
  - `style-mod@4.1.4` (2026-09-18)
  - `crelt@1.0.7` (2026-06-27)
  - `w3c-keyname@2.2.8` (2023-06-07)
  - `codemirror@6.0.2` (2025-06-19; dist-tag `version5` = 5.65.21, 2026-02-07)
  - Sources: [npm registry](https://registry.npmjs.org/@codemirror/view) and the per-package registry documents above
- **Install scripts:** none of these packages declares install/preinstall/postinstall. They declare only `prepare` (for example `cm-buildhelper src/index.ts`, `rollup -c`, `node build.js`) — [npm registry: @codemirror/state](https://registry.npmjs.org/@codemirror/state); [@lezer/lr](https://registry.npmjs.org/@lezer/lr)
- **Resolved tree:** `codemirror@6.0.2` (basicSetup) resolves to 16 packages: @codemirror/{autocomplete, commands, language, lint, search, state, streamparser, view}, @lezer/{common, highlight, lr}, @marijn/find-cluster-break, crelt, style-mod, w3c-keyname and codemirror itself. Adding `@codemirror/lang-javascript` brings in `@lezer/javascript`, for 18 packages in total, all from the same maintainer — computed from registry metadata ([codemirror](https://registry.npmjs.org/codemirror), [@codemirror/lang-javascript](https://registry.npmjs.org/@codemirror/lang-javascript))
- **Advisories:** OSV returns no advisories or MAL- records for the @codemirror packages (view, state, language, commands, lang-javascript, autocomplete, lint, search, streamparser), the @lezer packages (common, lr, javascript, highlight), style-mod, w3c-keyname, crelt or @marijn/find-cluster-break. The only record under the `codemirror` package name is GHSA-4gw3-8f77-f72c / CVE-2020-7760, a ReDoS in v5 fixed in 5.58.2 — [OSV query for npm/codemirror](https://osv.dev/list?ecosystem=npm&q=codemirror); [OSV GHSA-4gw3-8f77-f72c](https://osv.dev/vulnerability/GHSA-4gw3-8f77-f72c)
- **No malware advisories:** the GitHub Advisory Database has 0 malware advisories for `codemirror`, `@codemirror/view`, `@codemirror/state`, `@lezer/common`, `style-mod`, `w3c-keyname` and `crelt` (queried 2026-10-14) — [GitHub advisories API, type=malware](https://api.github.com/advisories?type=malware&ecosystem=npm&affects=codemirror)
- **Bundle size:** the official bundling example says minification gets "the full bundle down to around 400 kilobytes (135 kilobytes when gzipped…)" for basic setup plus a language mode. A minimal editor reduces "the stripped code to 250 kilobytes (75 kilobytes gzipped)" — [CodeMirror: Bundling with Rollup](https://codemirror.net/examples/bundle/). A third-party listing puts `codemirror@6.0.2` at about 364 KB minified / 116 KB gzipped — [depscope.dev](https://depscope.dev/pkg/npm/codemirror) (third-party, may be dated)

### Inferences
- **Concentration risk:** all 18 packages depend on one maintainer's npm account. There is no provenance and no co-maintainer, so a single phished or stolen token could push a malicious update to the whole stack. The clean record over about six years (no advisory, no MAL-) is reassuring but does not remove this structural risk.
- **Pinning and bundling:** pin exact versions with a lockfile and bundle at build time, rather than loading from a CDN. That is natural for a single offline HTML file and also means a later registry compromise cannot reach already-generated decks.
- **Install scripts:** `prepare` scripts do not run when a package is installed from the registry tarball (npm only runs `prepare` for local and git installs), so install-time execution exposure is effectively nil. This is background npm behaviour, not re-verified here.
- **Where the real risk is:** the larger security concern is the generator's own "live-edit JavaScript" feature, which evaluates editor contents in the page. CodeMirror does not evaluate code itself. Running demos in a sandboxed `<iframe sandbox="allow-scripts">` without `allow-same-origin` limits what a demo can do to the deck.

### Gaps
- No official statement of CodeMirror's security disclosure process (SECURITY.md) was retrieved.
- I did not check whether the migration to code.haverbeke.berlin changes the npm-publishing setup, for example 2FA enforcement.
- No bundle measurement was made for this project's exact feature set; the cited sizes are from the CodeMirror example and a third-party site.

## Q5. BMP→PNG conversion — `bmp-js`/`bmp-ts` + `pngjs` vs `jimp`

### Takeaway
sharp cannot read BMP. The lightest pure-JS route is `bmp-ts` (zero deps, last release 2024-03) plus `pngjs` (zero deps, last release 2023-02): 2 packages with no advisories and no install scripts, both mature but dormant. `bmp-js` has not been published since 2018 and should be avoided. `jimp` 1.6.1 (2026-04) works but drags in about 63 packages, including `debug` (malicious versions published in the September 2025 compromise), `file-type` (two 2026 DoS CVEs) and `xml2js` (a 2023 prototype-pollution CVE). It is too heavy for one BMP conversion.

### Cited Findings
- **sharp formats:** the prebuilt binaries support JPEG, PNG, Ultra HDR, WebP, AVIF, TIFF, GIF and SVG input; BMP is not listed — [sharp install docs](https://sharp.pixelplumbing.com/install)
- **`bmp-js@0.1.0`:** published 2018-04-23 and the only release since 2016. No dependencies, single maintainer `shaozilee`, about 646 KB unpacked (35 files) — [npm registry: bmp-js](https://registry.npmjs.org/bmp-js)
- **`bmp-ts@1.0.9`:** published 2024-03-24 (1.0.5–1.0.9 all released 2024-03-23/24). No dependencies, maintainer `alisowski` (who also publishes jimp), repo `hipstersmoothie/bmp-ts`, about 139 KB unpacked — [npm registry: bmp-ts](https://registry.npmjs.org/bmp-ts)
- **`pngjs@7.0.0`:** published 2023-02-20. No dependencies, single maintainer `lukeapage`, `engines.node >= 14.19.0`, none of its 24 versions has provenance — [npm registry: pngjs](https://registry.npmjs.org/pngjs)
- **No advisories:** OSV returns no advisories or MAL- records for `bmp-js`, `bmp-ts`, `pngjs`, `jimp`, `@jimp/core` or `@jimp/js-bmp` — [OSV.dev](https://osv.dev/list?ecosystem=npm&q=pngjs). The GitHub Advisory DB has 0 malware advisories for `jimp`, `pngjs` and `bmp-ts` — [GitHub advisories API](https://api.github.com/advisories?type=malware&ecosystem=npm&affects=jimp)
- **`jimp@1.6.1`:** published 2026-04-07, the first release since 1.6.0 on 2024-09-09. It depends on 27 `@jimp/*` packages. Maintainers: oliver.moran and alisowski. None of its 282 versions has provenance — [npm registry: jimp](https://registry.npmjs.org/jimp)
- **jimp resolved tree:** about 63 packages, including `bmp-ts@1.0.9` (via `@jimp/js-bmp`), `pngjs@6.0.0`, `jpeg-js@0.4.4`, `debug@4.4.3`, `file-type@21.3.4`, `xml2js@0.5.0`, `zod`, `@types/node@16.9.1`, `gifwrap`, `utif2`, `image-q`, `tinycolor2` and `pixelmatch` — computed from [npm registry: jimp](https://registry.npmjs.org/jimp) metadata
- **Advisories in jimp's tree:**
  - `file-type` has CVE-2026-31808 (infinite loop in the ASF parser, 2026-03-10) and CVE-2026-32630 (ZIP decompression-bomb DoS, 2026-03-13), plus CVE-2022-36313.
  - `jpeg-js` has CVE-2020-8175 and CVE-2022-25851.
  - `xml2js` has CVE-2023-0842 (prototype pollution).
  - Source: [OSV query for npm/file-type](https://osv.dev/list?ecosystem=npm&q=file-type); [OSV npm/jpeg-js](https://osv.dev/list?ecosystem=npm&q=jpeg-js); [OSV npm/xml2js](https://osv.dev/list?ecosystem=npm&q=xml2js)
- **`debug` compromise:** debug has OSV record MAL-2025-46974, "Malicious code in debug (npm)", published 2025-09-08. It was one of the 18 packages hijacked on 2025-09-08 — [OSV MAL-2025-46974](https://osv.dev/vulnerability/MAL-2025-46974); [Semgrep write-up](https://semgrep.dev/blog/2025/chalk-debug-and-color-on-npm-compromised-in-new-supply-chain-attack)

### Inferences
- **Recommended route:** `bmp-ts` + `pngjs` (or sharp's PNG encoder fed with raw RGBA from `bmp-ts`, which avoids `pngjs` entirely if sharp is already present). That adds 1–2 zero-dependency packages and no native code. Their dormancy is acceptable for a narrow, stable format parser processing the author's own files.
- **Write your own decoder:** an in-house uncompressed-BMP decoder (24/32-bit BI_RGB/BI_BITFIELDS) is about 100 lines and removes the dependency entirely. Alternatively, reject BMP and ask the author to convert it.
- **Why not jimp:** jimp's 63-package tree is mostly unrelated to BMP→PNG. It includes packages with recent CVEs and a package (`debug`) that was hijacked in 2025, which widens supply-chain exposure for a marginal feature.

### Gaps
- Whether the patched `xml2js` version is 0.5.0 (the version jimp resolves to) was not confirmed in this session.
- Which `debug` version(s) MAL-2025-46974 covers was not printed; it is believed to be 4.4.2.
- No fuzzing or security review of `bmp-ts` / `pngjs` parsers was found.
- I found no reliable source on whether `bmp-ts` handles malformed headers safely (for example huge width/height leading to allocation DoS).

## Q6. Involvement in 2025–2026 npm supply-chain incidents

### Takeaway
I found no evidence that `yaml`, `js-yaml`, `sharp`/`@img/*`, `katex`, any CodeMirror/Lezer package, `pngjs`, `bmp-ts`, `bmp-js` or `jimp` (top level) had a malicious version published. This covers the September 2025 chalk/debug hijack, the Shai-Hulud waves (Sept and Nov 2025) and the 2026 incidents (Axios in March, `@redhat-cloud-services` in June, the Keyv "ChainDrop" worm in August). OSV has MAL- records for the known victims (debug, chalk, keyv, axios) but none for these packages. The only indirect touchpoint is `jimp`'s transitive `debug`.

### Cited Findings
- **OSV calibration:** OSV returns MAL- records for known victims: `debug` MAL-2025-46974 (2025-09-08), `chalk` MAL-2025-46969 (2025-09-08), `keyv` MAL-2026-11524 (2026-08-04) and `axios` MAL-2026-2307 (2026-03-31). The same queries return no MAL- records for yaml, js-yaml, sharp, katex, codemirror, @codemirror/*, @lezer/*, style-mod, w3c-keyname, crelt, @img/* (checked platforms), commander, semver, detect-libc, pngjs, bmp-ts, bmp-js or jimp (queried 2026-10-14) — [OSV.dev](https://osv.dev/vulnerability/MAL-2025-46974); [OSV MAL-2026-11524](https://osv.dev/vulnerability/MAL-2026-11524); [OSV MAL-2026-2307](https://osv.dev/vulnerability/MAL-2026-2307)
- **GitHub malware advisories:** the GitHub Advisory Database returns 0 malware-type advisories for yaml, js-yaml, sharp, katex, codemirror, @codemirror/view, @codemirror/state, @lezer/common, style-mod, w3c-keyname, crelt, jimp, pngjs and bmp-ts. bmp-js and @img/* could not be checked because of the API rate limit — [GitHub advisories API](https://api.github.com/advisories?type=malware&ecosystem=npm&affects=sharp)
- **September 2025 chalk/debug hijack:** malicious versions of 18 packages, including chalk, debug, ansi-styles, supports-color and strip-ansi, were published on 2025-09-08. A separate duckdb compromise followed on 2025-09-09 — [Semgrep](https://semgrep.dev/blog/2025/chalk-debug-and-color-on-npm-compromised-in-new-supply-chain-attack)
- **Shai-Hulud 2.0 (Nov 2025):** hundreds of npm packages and more than 25,000 GitHub repos compromised between 21 and 23 November 2025 — [Check Point](https://blog.checkpoint.com/research/shai-hulud-2-0-inside-the-second-coming-the-most-aggressive-npm-supply-chain-attack-of-2025/). ReversingLabs counted 795 packages — [ReversingLabs](https://www.reversinglabs.com/blog/new-shai-hulud-worm-spreads-what-to-know). Named targets include Zapier, ENS Domains, AsyncAPI, PostHog and Postman, and the payload runs via a `preinstall` script — [HivePro](https://www.hivepro.com/threat-advisory/shai-hulud-2-0-fuels-global-npm-supply-chain-compromise/). These details come from search-result summaries; the full package lists were not fetched.
- **2026 Axios:** the maintainer account was hijacked and malicious `axios` 1.14.1 and 0.30.4 were published (2026-03-30/31), delivering a RAT — [CISA alert](https://www.cisa.gov/news-events/alerts/2026/04/20/supply-chain-compromise-impacts-axios-node-package-manager); [Trend Micro](https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html) (search-result summary)
- **2026 Red Hat:** 32 or more `@redhat-cloud-services` packages were compromised (2026-06-01) via a GitHub account infected through a malicious VS Code extension — [Red Hat RHSB-2026-006](https://access.redhat.com/security/vulnerabilities/RHSB-2026-006) (search-result summary)
- **2026 ChainDrop worm:** began 2026-08-04 with malicious `keyv@6.0.0`, Cacheable-family packages and `ecto@5.0.1`. It spreads via a `preinstall` script, stolen npm tokens that bypass 2FA, GitHub workflow injection, and pushed `.vscode/tasks.json` / `.claude/settings.json` files. "Genuine SLSA provenance was generated for the malicious keyv@6.0.0" — [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/). Aikido reported at least 444 packages and 1,381 versions by 2026-08-05 — [Aikido](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack) (search-result summary)

### Inferences
- **Per-package exposure:**
  - The directly proposed packages (yaml, sharp, katex, CodeMirror 6) and their resolved transitive deps were not victims.
  - gray-matter's tree (js-yaml 3, argparse 1, esprima, kind-of, …) and jimp's 63-package tree are where incident-adjacent risk accumulates: jimp includes `debug`, a 2025 victim.
  - The CodeMirror stack's structural risk is the single personal publisher account, the same pattern exploited in the chalk/debug and Axios takeovers.
- **Mitigations:** most 2025–2026 worms executed via `preinstall` scripts. Installing with `--ignore-scripts` (none of the proposed packages needs scripts as of sharp 0.35) plus a committed lockfile and a release-age delay policy would have blunted every incident listed.

### Gaps
- No primary source was fetched for the first Shai-Hulud wave (Sept 2025) or for its affected-package list.
- The Datadog ChainDrop CSV and Socket's Shai-Hulud 2.0 list could not be scanned (GitHub API rate limit). The "not affected" conclusion therefore rests on OSV MAL- records and GitHub malware advisories, not a full IOC-list scan.
- I found no reliable information on incidents in September–October 2026 beyond ChainDrop.

## Q7. npm provenance / trusted publishing

### Takeaway
Only sharp (and all `@img/sharp-*` / `@img/sharp-libvips-*` packages) publishes through npm trusted publishing (GitHub Actions OIDC) with SLSA provenance, starting with 0.34.4-rc.3 on 2025-09-15. yaml, js-yaml, katex, all CodeMirror/Lezer packages, pngjs, bmp-ts and jimp publish from personal maintainer accounts with no provenance on any version. Provenance is not a safety guarantee: the ChainDrop worm produced valid provenance for a malicious release.

### Cited Findings
- **sharp:** `sharp@0.35.5` was published by "GitHub Actions" (`npm-oidc-no-reply@github.com`) with a `trustedPublisher` record (`id: github`) and an SLSA v1 provenance attestation. The first sharp version with an attestation is 0.34.4-rc.3 (2025-09-15); 0.34.5 (2025-11-06) and all 0.35.x versions carry provenance — [npm registry: sharp](https://registry.npmjs.org/sharp)
- **sharp platform packages:** `@img/sharp-darwin-arm64@0.35.5` and `@img/sharp-libvips-darwin-arm64@1.3.4` are likewise trusted-published with SLSA v1 provenance, from the `lovell/sharp` and `lovell/sharp-libvips` repos — [npm registry: @img/sharp-darwin-arm64](https://registry.npmjs.org/@img/sharp-darwin-arm64); [@img/sharp-libvips-darwin-arm64](https://registry.npmjs.org/@img/sharp-libvips-darwin-arm64)
- **Packages with no provenance on any version:** yaml (0 of 105), katex (0 of 127), js-yaml (0 of 92), codemirror (0 of 155), @codemirror/view (0 of 259), pngjs (0 of 24), jimp (0 of 282) — [npm registry: yaml](https://registry.npmjs.org/yaml); [katex](https://registry.npmjs.org/katex); [js-yaml](https://registry.npmjs.org/js-yaml); [codemirror](https://registry.npmjs.org/codemirror); [@codemirror/view](https://registry.npmjs.org/@codemirror/view); [pngjs](https://registry.npmjs.org/pngjs); [jimp](https://registry.npmjs.org/jimp)
- **Publishers of the latest versions:** `eemeli` (yaml), `edemaine` (katex), `marijn` (all CodeMirror/Lezer), `vitaly` (js-yaml), `lukeapage` (pngjs), `alisowski` (jimp, bmp-ts) — registry `_npmUser` fields at the URLs above
- **Provenance limits:** provenance "can faithfully attest to malicious content" when the workflow itself is compromised, and is "not a safety verdict" — [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/)

### Inferences
- **What provenance buys:** for the one package that ships opaque native binaries (sharp/libvips), provenance links each binary to a public GitHub Actions build of a specific commit, which is the most valuable place to have it. For the pure-JS packages, the lack of provenance mainly means a stolen personal token could publish without a CI trail. A lockfile, exact pins and a release-age delay are the practical compensating controls.
- **Checking it:** `npm audit signatures` can verify registry signatures and provenance for sharp/@img in CI. This is background knowledge, not re-verified here.

### Gaps
- Whether yaml, katex or CodeMirror maintainers enforce 2FA or have announced plans to adopt trusted publishing was not found.
- Whether npm's 2025–2026 token and 2FA policy changes apply to these accounts could not be determined from registry metadata.
