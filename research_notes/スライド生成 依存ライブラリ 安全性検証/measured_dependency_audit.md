# Measured npm dependency trees and npm built-in audits for the slide-generator candidate libraries

Measurement environment (applies to every finding below): macOS (Darwin 25.4.0, arm64), `node v25.9.0`, `npm 11.12.1`, registry `https://registry.npmjs.org/`. Measured 2026-10-14 between 02:51Z and 03:00Z UTC (11:51–12:00 JST). The "last 7 days" cutoff used throughout is **2026-10-07T02:52Z**.

Every measurement ran in its own new, empty directory under `/private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/<name>/` (directories `m-core`, `c-<pkg>` for each core package, `o-<pkg>` for each optional package, and `age7-*`). Nothing was installed in the project directory. No package code was executed or imported. Each directory holds a `_report.txt` with the full raw output, plus `_audit.json`, `_sig.txt`, `_sigatt.json` and `_tree.txt`.

Commands run in each directory (from the script `scratchpad/scripts/measure.sh`):
```
npm init -y
npm install --ignore-scripts --no-fund --no-audit <pkgs>
npm ls --depth=0
npm ls --all --parseable | wc -l          # includes the root project line
npm query '*' | jq length                 # includes the root project
jq '[.packages|keys[]|select(.!="")]|length' package-lock.json
du -sh node_modules ; du -sk node_modules
npm query ':attr(scripts, [preinstall]), :attr(scripts, [install]), :attr(scripts, [postinstall])'
jq '.packages|to_entries[]|select(.value.hasInstallScript==true)' package-lock.json
find node_modules -name binding.gyp
grep -lE '"(preinstall|install|postinstall)"[[:space:]]*:' (every node_modules/**/package.json)   # cross-check
npm audit --json
npm audit signatures
npm audit signatures --json --include-attestations
npm view <pkg> --json        # full packument for each of the 96 package names seen in any tree (saved in scratchpad/meta/pk_*.json)
npm install --ignore-scripts --no-fund --no-audit --package-lock-only --min-release-age=7 <pkgs>   # age7-* dirs
```
Package counts below **exclude** the root project. So they equal `npm ls --all --parseable | wc -l` minus 1, which matched the package-lock entry count in every case except sharp (explained in its section).

## Q1. Total packages in node_modules, size on disk, and install scripts (per package and for the combined core set)

### Takeaway
The combined core set (`markdown-it markdown-it-container markdown-it-attrs markdown-it-front-matter shiki yaml`) installs **56 packages, 27 MB (27,472 KiB)**. **Zero** packages in it declare `preinstall`/`install`/`postinstall`, and none has a root `binding.gyp`. shiki accounts for 45 of the 56 packages and about 22 MB, and `@shikijs/langs` alone is 10.5 MB. No package in any measured tree, core or optional, sharp included, declares a lifecycle install script.

### Cited Findings
Per-measurement results (top-level versions are the versions that resolved, which are also the `latest` dist-tag for every direct package):

| Measurement | Resolved top-level version(s) | Packages (excl. root) | `du` node_modules | Install scripts (npm query / lock `hasInstallScript` / grep) |
|---|---|---|---|---|
| **core set (6 pkgs)** | markdown-it 15.0.2, markdown-it-container 4.0.0, markdown-it-attrs 5.0.1, markdown-it-front-matter 0.2.4, shiki 4.5.0, yaml 2.9.1 | **56** | **27M (27,472 KiB)** | none / none / none |
| markdown-it | 15.0.2 | 7 | 2.8M (2,912 KiB) | none |
| markdown-it-container | 4.0.0 | 1 | 44K | none |
| markdown-it-attrs | 5.0.1 | 8 | 3.3M (3,356 KiB) | none |
| markdown-it-front-matter | 0.2.4 | 1 | 32K | none |
| shiki | 4.5.0 | 45 | 22M (22,772 KiB) | none |
| yaml | 2.9.1 | 1 | 1.3M (1,280 KiB) | none |
| sharp | 0.35.5 | 9 on disk (3 flagged "extraneous" by `npm ls`), 32 lockfile entries | 29M (29,308 KiB) | none (but see the `binding.gyp` note) |
| katex | 0.19.0 | 2 (katex + commander@15.0.0) | 4.6M (4,704 KiB) | none |
| codemirror + @codemirror/lang-javascript | 6.0.2 + 6.2.5 | 18 | 4.0M (4,064 KiB) | none |
| gray-matter | 4.0.3 | 10 | 1.1M (1,136 KiB) | none |
| highlight.js | 11.12.0 | 1 | 9.2M (9,432 KiB) | none |
| marked | 18.1.1 | 1 | 532K | none |

Sources for each row: [m-core report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/m-core/_report.txt), [c-markdown-it](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it/_report.txt), [c-markdown-it-container](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it-container/_report.txt), [c-markdown-it-attrs](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it-attrs/_report.txt), [c-markdown-it-front-matter](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it-front-matter/_report.txt), [c-shiki](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-shiki/_report.txt), [c-yaml](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-yaml/_report.txt), [o-sharp](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt), [o-katex](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-katex/_report.txt), [o-codemirror](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-codemirror/_report.txt), [o-gray-matter](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-gray-matter/_report.txt), [o-highlightjs](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-highlightjs/_report.txt), [o-marked](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-marked/_report.txt)

- The full core tree (56 packages): @shikijs/core, engine-javascript, engine-oniguruma, langs, primitive, themes and types (all 4.5.0), @shikijs/vscode-textmate@10.0.2, @types/hast@3.0.5, @types/mdast@4.0.4, @types/unist@3.0.3, @ungap/structured-clone@1.4.0, argparse@3.0.2, ccount@2.0.1, character-entities-html4@2.1.0, character-entities-legacy@3.0.0, comma-separated-tokens@2.0.3, dequal@2.0.3, devlop@1.1.0, entities@8.1.0, hast-util-to-html@9.0.5, hast-util-whitespace@3.0.0, html-void-elements@3.0.0, linkify-it@6.1.0, markdown-it@15.0.2, markdown-it-attrs@5.0.1, markdown-it-container@4.0.0, markdown-it-front-matter@0.2.4, mdast-util-to-hast@13.2.1, mdurl@2.1.0, micromark-util-character@2.1.1, micromark-util-encode@2.0.1, micromark-util-sanitize-uri@2.0.1, micromark-util-symbol@2.0.1, micromark-util-types@2.0.3, oniguruma-parser@0.12.2, oniguruma-to-es@4.3.6, property-information@7.2.0, punycode.js@2.3.1, regex@6.1.0, regex-recursion@6.0.2, regex-utilities@2.3.0, shiki@4.5.0, space-separated-tokens@2.0.2, stringify-entities@4.0.4, trim-lines@3.0.1, unist-util-is@6.0.1, unist-util-position@5.0.0, unist-util-stringify-position@4.0.0, unist-util-visit@5.1.0, unist-util-visit-parents@6.0.2, vfile@6.0.3, vfile-message@4.0.3, yaml@2.9.1, zwitch@2.0.4 — [m-core _tree.txt](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/m-core/_tree.txt)
- Largest packages in the core tree by `du -sk`: @shikijs/langs 10,768 KiB, shiki 4,032 KiB, markdown-it 1,952 KiB, @shikijs/themes 1,828 KiB, yaml 1,276 KiB, oniguruma-to-es 1,040 KiB, oniguruma-parser 1,004 KiB, regex 672 KiB, @shikijs/engine-oniguruma 652 KiB, entities 460 KiB, markdown-it-attrs 444 KiB, mdast-util-to-hast 412 KiB — [measured `du -sk node_modules/*` in m-core](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/m-core/)
- shiki 4.5.0 depends on @shikijs/core, engine-javascript, engine-oniguruma, langs, themes and types (all pinned to exactly 4.5.0), plus @shikijs/vscode-textmate ^10.0.2 and @types/hast ^3.0.5 — [shiki package.json (installed copy)](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-shiki/node_modules/shiki/package.json)
- markdown-it 15.0.2 has 6 runtime dependencies: argparse ^3.0.0, entities ^8.0.0, linkify-it ^6.0.0, mdurl ^2.1.0, punycode.js ^2.3.1, uc.micro ^3.0.0 — [markdown-it package.json (installed copy)](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it/node_modules/markdown-it/package.json)
- markdown-it-attrs 5.0.1 has no `dependencies`, only `peerDependencies: {"markdown-it": ">= 9.0.0"}`. npm 11 auto-installs the peer, which is why its standalone tree has 8 packages (markdown-it + its 6 deps + itself) — [markdown-it-attrs package.json (installed copy)](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/c-markdown-it-attrs/node_modules/markdown-it-attrs/package.json)
- The `npm query` install-script selector, the lockfile `hasInstallScript` flag and the raw grep over every `node_modules/**/package.json` all returned **zero** hits in all 13 measured trees — [grep cross-check, measured; per-dir reports above](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/)
- The only `binding.gyp` in any tree is `node_modules/sharp/src/binding.gyp`, in a subdirectory, not the package root — [o-sharp report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt)
- katex 0.19.0 pulls exactly one dependency, commander@15.0.0 — [o-katex _tree.txt](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-katex/_tree.txt)
- The codemirror + lang-javascript tree (18): @codemirror/autocomplete@6.20.3, commands@6.11.1, lang-javascript@6.2.5, language@6.13.1, lint@6.9.7, search@6.7.2, state@6.7.6, streamparser@6.0.0, view@6.43.14, @lezer/common@1.5.3, @lezer/highlight@1.2.5, @lezer/javascript@1.5.6, @lezer/lr@1.4.11, @marijn/find-cluster-break@1.0.4, codemirror@6.0.2, crelt@1.0.7, style-mod@4.1.4, w3c-keyname@2.2.8 — [o-codemirror _tree.txt](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-codemirror/_tree.txt)
- The gray-matter tree (10): argparse@1.0.10, esprima@4.0.1, extend-shallow@2.0.1, gray-matter@4.0.3, is-extendable@0.1.1, js-yaml@3.15.2, kind-of@6.0.3, section-matter@1.0.0, sprintf-js@1.0.3, strip-bom-string@1.0.0 — [o-gray-matter _tree.txt](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-gray-matter/_tree.txt)

### Inferences
- Because no package in the core tree declares an install hook or has a root `binding.gyp`, `--ignore-scripts` costs the core set no functionality. A project-wide `ignore-scripts=true` in `.npmrc` should be free for the core set.
- shiki is the dominant cost: 80% of the core packages (45/56) and about 83% of the bytes (22,772/27,472 KiB). Without shiki, the markdown-it + plugins + yaml portion is about 11 packages and roughly 5 MB, inferred from the per-package measurements: markdown-it-attrs' tree already includes markdown-it's, and container, front-matter and yaml have no deps.
- Among the optional packages, marked (1 pkg, 532 KB) and highlight.js (1 pkg, 9.2 MB) are dependency-free. gray-matter adds 10 packages, which duplicates what `markdown-it-front-matter` + `yaml` (2 packages, 0 transitive deps) already provide.

### Gaps
- Sizes come from `du` on APFS. Packed tarball sizes (`dist.unpackedSize`) were not tabulated. Sizes on Linux or Windows would differ for sharp, which uses different platform packages.
- Counts reflect resolution on 2026-10-14. Caret ranges (e.g., in markdown-it and shiki's @shikijs/vscode-textmate) mean a future install without a lockfile can resolve differently.

## Q2. `npm audit` and `npm audit signatures` results (core set and each optional package)

### Takeaway
`npm audit` reports **0 vulnerabilities** for the core set, each core package on its own, and sharp, katex, codemirror, highlight.js and marked. **gray-matter** is the only package with findings: **4 moderate**, all from a single advisory (GHSA-hp3w-g68c-fv3c, `sprintf-js` DoS, CVSS 5.3) reached via `js-yaml@3 → argparse@1 → sprintf-js@1.0.3`, with no non-breaking fix. `npm audit signatures` verified registry signatures on **100% of audited packages in every tree** (0 invalid, 0 missing). Only **9 of the 56** core packages have verified provenance attestations: the 8 shiki packages plus `entities`.

### Cited Findings
- core set: `npm audit` → info 0 / low 0 / moderate 0 / high 0 / critical 0 (exit 0). `npm audit signatures` → "56 packages have verified registry signatures", "9 packages have verified attestations" — [m-core report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/m-core/_report.txt)
- The 9 attested core packages: @shikijs/core, @shikijs/engine-javascript, @shikijs/engine-oniguruma, @shikijs/langs, @shikijs/primitive, @shikijs/themes, @shikijs/types, shiki (all 4.5.0; SLSA provenance v1 from `github.com/shikijs/shiki`, workflow `.github/workflows/release.yml`, ref `refs/tags/v4.5.0`, GitHub-hosted runner) and entities@8.1.0 (from `github.com/fb55/entities`, `.github/workflows/publish.yml`, `refs/tags/v8.1.0`) — [m-core _sigatt.json, decoded DSSE payloads](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/m-core/_sigatt.json)
- Direct core packages **without** provenance: markdown-it, markdown-it-container, markdown-it-attrs, markdown-it-front-matter and yaml (`dist.attestations` absent from the latest manifest). shiki has `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1` — [npm registry: markdown-it](https://registry.npmjs.org/markdown-it), [yaml](https://registry.npmjs.org/yaml), [shiki](https://registry.npmjs.org/shiki)
- Per-package signature and attestation counts: markdown-it 7/7 signatures, 1 attestation (entities). markdown-it-container 1/1, 0. markdown-it-attrs 8/8, 1 (entities). markdown-it-front-matter 1/1, 0. shiki 45/45, 8. yaml 1/1, 0 — [c-* reports](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/)
- Optional packages, signatures and attestations:
  - sharp: "audited 8 packages", 8 verified signatures, 7 verified attestations (sharp, @img/sharp-darwin-arm64, @img/sharp-libvips-darwin-arm64, @img/colour, detect-libc, semver, @emnapi/runtime)
  - katex: 2/2 signatures, 0 attestations
  - codemirror + lang-javascript: 18/18 signatures, 0 attestations
  - gray-matter: 10/10 signatures, 0 attestations
  - highlight.js: 1/1 signatures, 1 attestation (from `highlightjs/highlight.js` `release.yml` `refs/tags/11.12.0`)
  - marked: 1/1 signatures, 1 attestation (from `markedjs/marked` `.github/workflows/tests.yml` `refs/heads/master`)

  Sources: [o-sharp](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt), [o-katex](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-katex/_report.txt), [o-codemirror](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-codemirror/_report.txt), [o-gray-matter](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-gray-matter/_report.txt), [o-highlightjs](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-highlightjs/_report.txt), [o-marked](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-marked/_report.txt)
- sharp's other provenance sources: sharp and @img/sharp-darwin-arm64 come from `lovell/sharp` `.github/workflows/ci.yml` `refs/tags/v0.35.5`. @img/sharp-libvips-darwin-arm64 comes from `lovell/sharp-libvips` `ci.yml` `refs/tags/v1.3.4`. semver comes from `npm/node-semver` `release.yml` `refs/heads/main` — [o-sharp _sigatt.json](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_sigatt.json)
- gray-matter `npm audit --json` (exit 1): moderate 4, total 4. Affected: `sprintf-js` (range `*`, via advisory **GHSA-hp3w-g68c-fv3c** "sprintf-js vulnerable to denial of service through unbounded precision specifiers", advisory range `<=1.1.3`, CWE-1284, CVSS 5.3), `argparse` 1.0.0–1.0.10 (via sprintf-js), `js-yaml` 3.2.7–3.15.2 (via argparse) and `gray-matter` >=2.0.2 (direct, via js-yaml). npm's suggested `fixAvailable` is `gray-matter@2.0.1` with `isSemVerMajor: true`, i.e. a downgrade — [o-gray-matter _audit.json](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-gray-matter/_audit.json); advisory link as reported by npm audit: [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
- The latest published `sprintf-js` is 1.1.3, the advisory's upper bound, and gray-matter's latest is still 4.0.3 (published 2021-04-24) — [npm registry: sprintf-js](https://registry.npmjs.org/sprintf-js), [gray-matter](https://registry.npmjs.org/gray-matter)
- Registry signature key IDs seen on the latest manifests: `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U` on recently published packages (markdown-it, markdown-it-attrs, shiki, yaml, sharp, katex, codemirror, @codemirror/lang-javascript, highlight.js, marked), and `SHA256:jl3bwswu80PjjokCgh0o2w5c2U4LhQAE57gj9cz1kzA` on older publishes (markdown-it-container 2023, markdown-it-front-matter 2024, gray-matter 2021). Both kinds verified successfully under `npm audit signatures` — [npm registry packuments, `dist.signatures[0].keyid`](https://registry.npmjs.org/markdown-it-container)

### Inferences
- With every version of `sprintf-js` up to 1.1.3, the latest, inside the advisory range, a gray-matter install cannot get to a clean `npm audit` without an `overrides` entry or dropping gray-matter. This favors the core set's `markdown-it-front-matter` + `yaml` combination, which audits clean.
- In the sharp tree, 9 packages are on disk but only 8 were audited for signatures. `@img/sharp-wasm32@0.35.5` has registry attestations but does not appear in the verified-attestation list, so it is most likely the package `npm audit signatures` skipped: it is "extraneous" and not in the logical dependency graph. This is inferred from the counts, not shown directly by npm.
- Provenance coverage of the core set is shiki-centric. The markdown-it family and yaml are signed by the registry but have no build provenance, so `npm audit signatures` cannot tie their tarballs to a source commit.
- marked's provenance points to a workflow on `refs/heads/master` (`tests.yml`) rather than a tag. highlight.js, sharp and shiki attest from tag refs.

### Gaps
- `npm audit` uses the GitHub Advisory Database as served via the npm bulk advisory endpoint at measurement time. This research did not independently verify advisory content, and CVE/web research is covered by other researchers.
- For `npm audit signatures --json --include-attestations`, npm 11.12.1's `verified` array lists only packages with attestations, so the JSON does not directly show which sharp package was excluded from the 8 audited.

## Q3. Unique npm maintainers in the core set's tree, and maintainers of direct dependencies

### Takeaway
The 56-package core tree is owned by **18 unique npm maintainer accounts** (from the packument `maintainers` field). One author account, `wooorm`, maintains **26 of the 56** packages: all of shiki's unified/hast/micromark helper packages. Nine of the installed core versions were published by "GitHub Actions" (all shiki packages and entities). The other 47 were published from individual accounts.

### Cited Findings
- The 18 core-tree maintainer accounts: antfu, arve0, craigdmckenna, eemeli, fb55, google-wombot, kmck, lukeed, mathias, octref, orta, parksb, shiki-deploys, slevithan, types, vitaly, webreflection, wooorm — [computed from `npm view <pkg> --json` packuments, scratchpad/meta/pk_*.json](https://registry.npmjs.org/shiki)
- Maintainers of the core direct dependencies:
  - markdown-it: `vitaly` ([registry](https://registry.npmjs.org/markdown-it))
  - markdown-it-container: `vitaly` ([registry](https://registry.npmjs.org/markdown-it-container))
  - markdown-it-attrs: `arve0` ([registry](https://registry.npmjs.org/markdown-it-attrs))
  - markdown-it-front-matter: `craigdmckenna`, `parksb` ([registry](https://registry.npmjs.org/markdown-it-front-matter))
  - shiki: `antfu`, `octref`, `orta`, `shiki-deploys` ([registry](https://registry.npmjs.org/shiki))
  - yaml: `eemeli` ([registry](https://registry.npmjs.org/yaml))
- Maintainers of the optional direct packages:
  - sharp: `lovell` ([registry](https://registry.npmjs.org/sharp))
  - katex: `edemaine`, `gagern`, `kevinbarabash`, `khanacademy`, `sophiebits`, `xymostech`, `ylemkimon` ([registry](https://registry.npmjs.org/katex))
  - codemirror: `marijn` ([registry](https://registry.npmjs.org/codemirror))
  - @codemirror/lang-javascript: `adrianheine`, `marijn` ([registry](https://registry.npmjs.org/@codemirror/lang-javascript))
  - gray-matter: `doowb`, `jonschlinkert`, `rmassaioli` ([registry](https://registry.npmjs.org/gray-matter))
  - highlight.js: `highlightjs_bot`, `isagalaev`, `joshgoebel`, `marcosc` ([registry](https://registry.npmjs.org/highlight.js))
  - marked: `amidknight`, `chjj`, `styfle`, `tonybrix` ([registry](https://registry.npmjs.org/marked))
- Publisher (`_npmUser`) of each installed core version, by count:
  - wooorm 26: all unist-*, hast-*, mdast-*, micromark-util-*, vfile*, ccount, character-entities-*, comma/space-separated-tokens, devlop, html-void-elements, property-information, stringify-entities, trim-lines, zwitch
  - GitHub Actions 9: the 8 shiki packages + entities
  - vitaly 6: markdown-it, markdown-it-container, argparse, linkify-it, mdurl, uc.micro
  - slevithan 5: regex, regex-recursion, regex-utilities, oniguruma-parser, oniguruma-to-es
  - types 3: @types/*
  - 1 each: webreflection, parksb, lukeed, google-wombot, eemeli, arve0, antfu

  Source: [registry packuments `_npmUser`, scratchpad/meta](https://registry.npmjs.org/markdown-it)
- Optional publishers: sharp@0.35.5, highlight.js@11.12.0 and marked@18.1.1 were published by "GitHub Actions". katex@0.19.0 by `edemaine`, codemirror@6.0.2 and @codemirror/lang-javascript@6.2.5 by `marijn`, gray-matter@4.0.3 by `rmassaioli` — [registry packuments](https://registry.npmjs.org/sharp)
- Unique maintainers per measured tree: markdown-it 4, markdown-it-attrs 5, markdown-it-container 1, markdown-it-front-matter 2, shiki 10, yaml 1, core set 18. Optional: sharp 14 (5 if the extraneous @emnapi/runtime and tslib are excluded), katex 9, codemirror 2, gray-matter 7, highlight.js 4, marked 4 — [computed by scratchpad/scripts/maint.py from registry packuments](https://registry.npmjs.org/)

### Inferences
- The publisher of 9 installed versions being "GitHub Actions", which matches exactly the packages with SLSA provenance, is consistent with npm trusted publishing (OIDC) for shiki and entities. The rest of the core tree is published with personal account tokens or credentials.
- Account-compromise exposure is concentrated: one account (`wooorm`) publishes 26 core-tree packages and one (`vitaly`) publishes markdown-it, its container plugin and 4 of its deps. Several direct dependencies (markdown-it, markdown-it-container, markdown-it-attrs, yaml, sharp, codemirror) have a single maintainer account.
- `types` (DefinitelyTyped) and `shiki-deploys` appear to be organizational or bot accounts, not individuals, inferred from their names.

### Gaps
- The `maintainers` field lists current package owners, not who can publish via org/team membership or trusted-publisher configuration. 2FA enforcement status per account is not exposed by the registry API and was not measured.

## Q4. Latest version publish dates; packages published within the last 7 days (minimum-release-age relevance)

### Takeaway
For every direct package, the resolved version was the `latest` dist-tag. **marked 18.1.1** (published 2026-10-12T12:29Z, about 1.6 days before measurement) is the only direct package whose latest release is under 7 days old. Four transitive codemirror packages are also under 7 days old. **Nothing in the core tree is under 7 days old**: the newest is shiki 4.5.0 at 2026-10-01, 13 days. npm 11.12.1 supports `min-release-age`. With `--min-release-age=7` the core set resolves to the identical 56-package tree, marked falls back to 18.1.0, and codemirror falls back to 4 older versions and drops a brand-new dependency.

### Cited Findings
- Latest version and publish time (UTC) of each direct package, all equal to the installed version:

  | Package | Latest | Published |
  |---|---|---|
  | markdown-it | 15.0.2 | 2026-09-11T04:04:18Z |
  | markdown-it-container | 4.0.0 | 2023-12-05T14:33:18Z |
  | markdown-it-attrs | 5.0.1 | 2026-07-27T18:50:27Z |
  | markdown-it-front-matter | 0.2.4 | 2024-04-04T04:27:52Z |
  | shiki | 4.5.0 | 2026-10-01T06:46:31Z |
  | yaml | 2.9.1 | 2026-09-11T20:30:10Z |
  | sharp | 0.35.5 | 2026-09-27T13:46:24Z |
  | katex | 0.19.0 | 2026-10-01T16:54:54Z |
  | codemirror | 6.0.2 | 2025-06-19T11:48:48Z |
  | @codemirror/lang-javascript | 6.2.5 | 2026-03-02T07:58:09Z |
  | gray-matter | 4.0.3 | 2021-04-24T03:06:31Z |
  | highlight.js | 11.12.0 | 2026-08-12T04:06:58Z |
  | **marked** | **18.1.1** | **2026-10-12T12:29:51Z ← within 7 days** |

  Source: `time[<latest>]` in the registry packuments: [markdown-it](https://registry.npmjs.org/markdown-it), [markdown-it-container](https://registry.npmjs.org/markdown-it-container), [markdown-it-attrs](https://registry.npmjs.org/markdown-it-attrs), [markdown-it-front-matter](https://registry.npmjs.org/markdown-it-front-matter), [shiki](https://registry.npmjs.org/shiki), [yaml](https://registry.npmjs.org/yaml), [sharp](https://registry.npmjs.org/sharp), [katex](https://registry.npmjs.org/katex), [codemirror](https://registry.npmjs.org/codemirror), [@codemirror/lang-javascript](https://registry.npmjs.org/@codemirror/lang-javascript), [gray-matter](https://registry.npmjs.org/gray-matter), [highlight.js](https://registry.npmjs.org/highlight.js), [marked](https://registry.npmjs.org/marked)
- `time.modified` differs from the latest-publish time for markdown-it (modified 2026-09-12T05:30Z), yaml (2026-09-11T23:20Z), codemirror (2026-02-07), @codemirror/lang-javascript (2026-04-13) and gray-matter (2023-07-12). That reflects metadata changes such as dist-tags, deprecations or other versions, not new latest releases — [registry packuments](https://registry.npmjs.org/gray-matter)
- Transitive packages whose installed version was published within 7 days (all in the codemirror tree): @codemirror/language 6.13.1 (2026-10-07T13:20:36Z), @codemirror/streamparser 6.0.0 (2026-10-07T11:22:03Z), @codemirror/view 6.43.14 (2026-10-07T11:24:16Z), @lezer/lr 1.4.11 (2026-10-07T11:40:01Z) — [registry: @codemirror/language](https://registry.npmjs.org/@codemirror/language), [@codemirror/streamparser](https://registry.npmjs.org/@codemirror/streamparser), [@codemirror/view](https://registry.npmjs.org/@codemirror/view), [@lezer/lr](https://registry.npmjs.org/@lezer/lr)
- `@codemirror/streamparser` is a **new package**: created 2026-10-07T11:18:54Z, with only versions `0.0.0-stage` and `6.0.0`. It became a dependency of @codemirror/language 6.13.x, whose 6.13.0 was published 2026-10-07T11:22:25Z. The prior line, 6.12.4 (2026-06-25), lacks it — [registry: @codemirror/streamparser](https://registry.npmjs.org/@codemirror/streamparser), [@codemirror/language](https://registry.npmjs.org/@codemirror/language)
- Installed versions published within 30 days, excluding the above: shiki and @shikijs/* 4.5.0 (2026-10-01), katex 0.19.0 (2026-10-01), @lezer/javascript 1.5.6 (2026-10-01), @lezer/highlight 1.2.5 (2026-09-28), sharp / @img/* 0.35.5 and libvips 1.3.4 (2026-09-27), micromark-util-types 2.0.3 (2026-09-26), @lezer/common 1.5.3 (2026-09-24), @codemirror/state 6.7.6 (2026-09-22), style-mod 4.1.4 (2026-09-18), @codemirror/commands 6.11.1 (2026-09-15) — [scratchpad/meta/table.json computed from registry packuments](https://registry.npmjs.org/)
- Oldest installed versions in the trees: is-extendable@0.1.1 (2015-07-04), sprintf-js@1.0.3 (2015-07-10), extend-shallow@2.0.1 (2015-07-16), section-matter@1.0.0 (2017), argparse@1.0.10 (2018-02-15), esprima@4.0.1 (2018-07-13), all in gray-matter's tree. The oldest in the core tree is ccount@2.0.1 (2021-10-28) — [registry packuments](https://registry.npmjs.org/sprintf-js)
- npm 11.12.1 config docs: "`min-release-age` · Default: null · Type: null or Number. If set, npm will build the npm tree such that only versions that were available more than the given number of days ago will be installed. If there are no versions available for the current set of dependencies, the command will error… This config cannot be used with: `before`" — [local npm 11.12.1 docs, /opt/homebrew/lib/node_modules/npm/docs/content/using-npm/config.md](file:///opt/homebrew/lib/node_modules/npm/docs/content/using-npm/config.md)
- Measured `npm install --ignore-scripts --no-fund --no-audit --package-lock-only --min-release-age=7 …` results:
  - core set: resolves to the **identical** 56 name@version set
  - `marked`: resolves to **marked@18.1.0**, published 2026-10-05T15:40:41Z
  - `codemirror @codemirror/lang-javascript`: resolves to 17 packages: @codemirror/language **6.12.4**, @codemirror/view **6.43.13**, @lezer/lr **1.4.10**, and **no** @codemirror/streamparser

  Sources: [age7-core](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/age7-core/_tree_age7.txt), [age7-marked](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/age7-marked/_tree_age7.txt), [age7-codemirror](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/age7-codemirror/_tree_age7.txt), [registry: marked time](https://registry.npmjs.org/marked)

### Inferences
- A 7-day `min-release-age` (e.g., `min-release-age=7` in the project `.npmrc`) costs the core set nothing today. It would actively change marked and the codemirror tree, including keeping out a package that has existed for less than 7 days (@codemirror/streamparser).
- The 18.1.0 published on 2026-10-05 was itself only about 8.5 days old, so marked's release cadence will regularly trigger a 7-day policy.
- The markdown-it plugins container (2023) and front-matter (2024) are old but stable. Under release-age policies that is a benefit. Under abandonment risk it is a cost, and other researchers should judge that.

### Gaps
- These ages are a snapshot as of 2026-10-14T02:52Z. They shift daily.
- This research did not test how `min-release-age` interacts with an existing lockfile (`npm ci`), since only fresh resolutions were measured.

## Q5. sharp: platform-specific prebuilt packages, bundled libvips version, and install scripts

### Takeaway
Yes. On darwin-arm64, `sharp@0.35.5` installs the prebuilt `@img/sharp-darwin-arm64@0.35.5` (`sharp-darwin-arm64-0.35.5.node`) and `@img/sharp-libvips-darwin-arm64@1.3.4`, which bundles **libvips 8.18.7** (`libvips-cpp.8.18.7.dylib`). sharp 0.35.5 declares **no** `preinstall`/`install`/`postinstall` script, and its `binding.gyp` sits in `src/`, so npm does not run node-gyp implicitly. npm 11.12.1 also installed an unneeded `@img/sharp-wasm32` (9.1 MB) plus `@emnapi/runtime` and `tslib`, all flagged extraneous. Without them, sharp's real footprint is about 19 MB.

### Cited Findings
- sharp 0.35.5 has `dependencies` `@img/colour ^1.1.0`, `detect-libc ^2.1.2` and `semver ^7.8.5`, plus **25** `optionalDependencies`. Of those, 13 are `@img/sharp-<platform>` binaries at 0.35.5, covering darwin-arm64/x64, linux arm/arm64/ppc64/riscv64/s390x/x64, linuxmusl arm64/x64 and win32 arm64/ia32/x64, plus the wasm wrappers freebsd-wasm32 and webcontainers-wasm32. 10 are `@img/sharp-libvips-<platform>@1.3.4` packages. Its `engines` is `node >=20.9.0` and `config.libvips` is `">=8.18.7"` — [sharp package.json (installed copy)](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/node_modules/sharp/package.json)
- sharp 0.35.5 `scripts` contains only `build` (`node install/build.js`), `build:dist`, `clean`, `test`, `lint*`, `test-leak`, `test-unit`, `package-*` and `docs-*`. There is **no** `install`, `preinstall` or `postinstall`. The lockfile has no `hasInstallScript` for any sharp-tree package — [sharp package.json](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/node_modules/sharp/package.json), [o-sharp report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt)
- Installed on disk (darwin-arm64): sharp@0.35.5, @img/sharp-darwin-arm64@0.35.5 ("Prebuilt sharp for use with macOS 64-bit ARM", `os:["darwin"]`, `cpu:["arm64"]`, file `lib/sharp-darwin-arm64-0.35.5.node`), @img/sharp-libvips-darwin-arm64@1.3.4 ("Prebuilt libvips and dependencies for use with sharp on macOS 64-bit ARM", `os:["darwin"]`, `cpu:["arm64"]`), @img/colour@1.1.0, detect-libc@2.1.2, semver@7.8.5, and also @img/sharp-wasm32@0.35.5, @emnapi/runtime@1.11.3 and tslib@2.8.1. Neither @img package declares `scripts` — [o-sharp _tree.txt and installed package.json files](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_tree.txt)
- `@img/sharp-libvips-darwin-arm64@1.3.4/versions.json`: vips 8.18.7, aom 3.15.1, archive 3.8.9, cairo 1.18.6, cgif 0.5.4, exif 0.6.26, expat 2.8.5, ffi 3.8.0, fontconfig 2.18.3, freetype 2.14.3, fribidi 1.0.17, glib 2.90.0, harfbuzz 14.5.0, heif 1.23.5, highway 1.4.0, imagequant 2.4.1, lcms 2.19.1, mozjpeg 0826579, pango 1.58.2, pixman 0.46.4, png 1.6.58, proxy-libintl 0.5, rsvg 2.63.2, tiff 4.7.2, uhdr 2.0.2, webp 1.6.0, xml2 2.15.4, zlib-ng 2.3.3. Its `exports["./binary"]` is `./lib/libvips-cpp.8.18.7.dylib` — [versions.json (installed copy)](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/node_modules/@img/sharp-libvips-darwin-arm64/versions.json)
- `npm ls` reports `extraneous: @emnapi/runtime@1.11.3`, `extraneous: @img/sharp-wasm32@0.35.5` and `extraneous: tslib@2.8.1`. The lockfile has 32 entries, 23 of them skipped platform-mismatched optional packages. `@img/sharp-wasm32` (no os/cpu restriction) is a dependency of the skipped `@img/sharp-freebsd-wasm32` (`os:["freebsd"]`) and `@img/sharp-webcontainers-wasm32` (`cpu:["wasm32"]`). `@emnapi/runtime` is a dependency of sharp-wasm32, and `tslib` a dependency of @emnapi/runtime — [o-sharp package-lock.json](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/package-lock.json), [o-sharp report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt)
- Disk usage within sharp's node_modules (KiB): @img/sharp-libvips-darwin-arm64 17,836; @img/sharp-wasm32 9,124; sharp 1,036; @emnapi/runtime 476; @img/sharp-darwin-arm64 300; semver 268; tslib 124; @img/colour 92; detect-libc 44; total 29,308 — [measured `du -sk` in o-sharp](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/)
- sharp tree audit: `npm audit` 0 vulnerabilities. Signatures 8/8 verified, 7 attestations. sharp, @img/sharp-darwin-arm64 and @img/sharp-libvips-darwin-arm64 all have SLSA provenance from `lovell/sharp` or `lovell/sharp-libvips` tag refs (`v0.35.5` / `v1.3.4`), published by "GitHub Actions" — [o-sharp report](file:///private/tmp/claude-501/-Users-centrevillage-projects-cv-slides/64718e7a-471c-4fae-b948-15f74f53455e/scratchpad/depaudit/o-sharp/_report.txt), [registry: sharp](https://registry.npmjs.org/sharp)

### Inferences
- Since sharp 0.35.5 has no install hook, `--ignore-scripts` should not break it on platforms with a prebuilt package: the binary arrives as a plain optional dependency. The `build` script, which compiles from source, only runs if invoked explicitly. This is inferred from the manifests. Running sharp was out of scope, so functionality was not verified.
- The extraneous `@img/sharp-wasm32` + `@emnapi/runtime` + `tslib` (9,724 KiB, 3 packages, 9 extra maintainer accounts) look like an npm 11.12.1 placement quirk for dependencies of skipped optional packages. Excluding them, sharp on darwin-arm64 is 6 packages and about 19,584 KiB (~19 MB).
- libvips 8.18.7 bundles many native media parsers (rsvg, heif, tiff, xml2, png, webp, cairo/pango, and more), so sharp brings a much larger native attack surface than the pure-JS core set. Its CVE exposure is libvips plus these libraries, which web-based CVE research should check against the versions listed above.

### Gaps
- Linux and Windows installs were not measured. Other platforms pull different `@img/sharp-*`/`sharp-libvips-*` packages with possibly different sizes, and linuxmusl versus glibc selection was not tested.
- Whether a fresh install on a platform without a prebuilt package fails or falls back silently was not tested, since that would require executing package code.
