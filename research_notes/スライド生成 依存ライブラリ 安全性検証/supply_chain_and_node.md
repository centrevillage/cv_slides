# npm Supply-Chain Landscape 2025–2026, Defensive Measures for a Solo Project, and Node.js 24 Security Posture

Scope: a local static slide generator (Node.js CLI on the author's macOS machine, ~5–10 direct deps such as markdown-it, shiki, yaml, optionally sharp/katex/codemirror; output is one offline HTML file). State as of 2026-10-14. Research was web-only; nothing was installed or run.

Source labels: **[primary]** means official docs, a changelog, a release note, a CISA alert, or the vendor that discovered the incident. **[secondary]** means a news outlet or aggregator. **[search-summary only]** means I saw the claim only in a search-result summary and did not fetch the page, so treat it as unverified.

---

## 1. Major npm supply-chain incidents, 2025–2026 (mechanisms, impact, common patterns)

### Takeaway
Since mid-2025, npm compromises have moved from one-off maintainer phishing (eslint-config-prettier, July 2025; chalk/debug, September 2025) to self-replicating credential-stealing worms. These began with Shai-Hulud (September 2025) and Shai-Hulud 2.0 (November 2025). In 2026 came the "Mini Shai-Hulud" / TeamPCP waves, then ChainDrop (August 2026), which was still active in October 2026. Almost all of these run code at install time (`preinstall`/`postinstall`) on developer machines and CI to steal npm, GitHub, cloud and SSH secrets. Since 2026, many also ship with **valid SLSA provenance**, because attackers abused legitimate CI and trusted-publishing pipelines.

### Cited Findings

**2025**

- **eslint-config-prettier and others, July 18, 2025 (maintainer phishing).**
  - The npm account of maintainer JounQin was phished.
  - Malicious versions: eslint-config-prettier 8.10.1, 9.1.1, 10.1.6 and 10.1.7.
  - Other packages from the same maintainer were also hit: eslint-plugin-prettier, synckit, @pkgr/core, napi-postinstall and got-fetch.
  - The phishing domain was the typosquat `npnjs.com`.
  - Source: [Snyk](https://snyk.io/blog/maintainers-of-eslint-prettier-plugin-attacked-via-npm-supply-chain-malware/) [search-summary only].
- **eslint-config-prettier payload and identifiers.**
  - An install script was added to package.json; the package has ~30M weekly downloads; CVE-2025-54313 was assigned — [SafeDep](https://safedep.io/eslint-config-prettier-major-npm-supply-chain-hack/) [search-summary only].
  - The payload was described as Windows-only, with an explicit platform check, so Linux and macOS were unaffected — [ZeroPath](https://zeropath.com/blog/cve-2025-54313-eslint-config-prettier-supply-chain-malware) [search-summary only; single source].
  - **The malware name "Scavenger" could not be confirmed** in the sources I retrieved. See Gaps.
- **npm trusted publishing (OIDC) became generally available on July 31, 2025.** This is listed here for the timeline; details are in Section 2. Source: [GitHub changelog](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) [primary].
- **Nx "s1ngularity", August 26, 2025.**
  - Malicious versions:
    - `nx` / `@nrwl/nx`: 20.9.0–20.12.0 and 21.5.0–21.8.0.
    - `@nx/devkit`, `@nx/js`, `@nx/node`, `@nx/workspace`: 21.5.0 and 20.9.0.
    - `@nx/eslint`: 21.5.0.
    - `@nx/enterprise-cloud` and `@nx/key`: 3.2.0.
  - Exposure window was about 8 hours. GitHub disabled the attacker repos on August 27 at 09:00 UTC.
  - Source: [Wiz](https://www.wiz.io/blog/s1ngularity-supply-chain-attack) [primary vendor analysis].
- **s1ngularity root cause.** A GitHub Actions workflow used `pull_request_target` and was vulnerable to injection through PR titles. It had been removed from master but still existed on older branches. Source: [Wiz](https://www.wiz.io/blog/s1ngularity-supply-chain-attack).
- **s1ngularity payload.**
  - A `postinstall` script ran `telemetry.js`, on Linux and macOS only.
  - It searched for wallets, keystores, `.env` files, SSH keys, GitHub tokens and `.npmrc` contents.
  - It appended `sudo shutdown -h 0` to `~/.bashrc` and `~/.zshrc`.
  - It **prompted locally installed AI CLIs (Claude, Gemini, Amazon Q) with permission-skipping flags** (`--dangerously-skip-permissions`, `--yolo`, `--trust-all-tools`) to inventory the filesystem. Wiz says this worked in "hundreds of cases."
  - Data was base64-encoded two or three times and pushed to public `s1ngularity-repository*` repos in the victim's own GitHub account.
  - Source: [Wiz](https://www.wiz.io/blog/s1ngularity-supply-chain-attack).
- **s1ngularity impact.**
  - Phase 1: over 1,000 valid GitHub tokens, dozens of cloud credentials and npm tokens, and about 20,000 files. The malware often ran on developer machines through the Nx VS Code extension.
  - Phase 2 (August 28–29): the leaked tokens were used to make **over 5,500 private repos public** across over 400 users and organizations.
  - Source: [Wiz](https://www.wiz.io/blog/s1ngularity-supply-chain-attack).
  - Other vendors give different counts. For example, GitGuardian cites 1,346 repos and 2,349 secrets — [DevOps.com / secondary roundup](https://devops.com/malicious-nx-packages-used-in-two-waves-of-supply-chain-attack/) [search-summary only].
- **chalk / debug / ansi-styles ("qix"), September 8, 2025.**
  - The maintainer was phished from `support [at] npmjs [dot] help`.
  - 18 packages were compromised, together **over 2 billion weekly downloads**. Versions included chalk 5.6.1, debug 4.4.2, ansi-styles 6.2.2, supports-color 10.2.1, strip-ansi 7.1.1, ansi-regex 6.2.1, wrap-ansi 9.0.1, color-convert 3.1.1, color-name 2.0.1 and others.
  - Aikido's feed alerted at 13:16 UTC.
  - Source: [Aikido](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised) [primary vendor].
  - The "2.6B weekly" figure appears in secondary coverage — [Security Boulevard](https://securityboulevard.com/2025/09/how-one-phishing-email-compromised-18-npm-packages-and-billions-of-installs).
  - The domain registration date conflicts: Aikido says September 5, 2025; other write-ups say September 4 — [Security Boulevard](https://securityboulevard.com/2025/09/how-one-phishing-email-compromised-18-npm-packages-and-billions-of-installs) [search-summary only].
- **chalk/debug payload.**
  - This was **browser-side runtime code, not an install script.** It hooked `fetch`, `XMLHttpRequest` and `window.ethereum`/Solana APIs, and rewrote wallet addresses and transaction parameters.
  - Chains targeted: ETH, BTC, SOL, TRX, LTC and BCH.
  - Follow-on: proto-tinker-wc@0.1.87 was compromised the same day by apparently the same actor.
  - Source: [Aikido](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised).
  - The lure was a fake "mandatory 2FA update", and the maintainer entered username, password and **TOTP** on the fake page — [The Register](https://www.theregister.com/2025/09/08/dev_falls_for_phishing_email) [search-summary only].
- **Shai-Hulud worm (v1), mid-September 2025.**
  - It compromised more than 500 packages.
  - It scanned for secrets, targeting GitHub PATs and AWS/GCP/Azure keys, and exfiltrated them to an endpoint and to a public GitHub repo named "Shai-Hulud".
  - It **used stolen npm tokens to publish tainted versions of the victim's other packages** (self-replication).
  - CISA advised pinning to versions released before September 16, 2025, and rotating all developer credentials.
  - Source: [CISA alert, Sept 23, 2025](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) [primary].
- **Shai-Hulud v1 mechanism details.**
  - @ctrl/tinycolor was among the hit packages.
  - Execution was via `postinstall` (bundle.js), with secrets discovery by abusing TruffleHog.
  - It added a `shai-hulud-workflow.yml` GitHub Actions workflow.
  - Unit 42 assessed with moderate confidence that an LLM wrote the malicious bash script.
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/) [primary vendor].
  - GitHub was notified on September 14 and removed about 500 packages — [The Record](https://therecord.media/cisa-urges-software-reviews-malicious-packages) [secondary, search-summary only].
- **GitHub announced its npm hardening plan on September 22, 2025**, in direct response. Details are in Section 2. Source: [GitHub blog](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/).
- **Shai-Hulud 2.0 ("Sha1-Hulud: The Second Coming"), November 21–24, 2025.**
  - Trojanized versions were uploaded November 21–23, and the first malicious npm versions were observed around 03:00 UTC on November 24, 2025.
  - Scale: about 700–800 npm packages and over 25,000 attacker repos across about 350–500 GitHub users.
  - Notable packages: Zapier (`@zapier/zapier-sdk`), ENS (`@ensdomains/ensjs`), PostHog (`posthog-node`), Postman (`@postman/tunnel-agent`), AsyncAPI and others.
  - Credential sample: 775 GitHub tokens, 373 AWS, 300 GCP and 115 Azure.
  - Source: [Wiz](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack) [primary vendor].
  - Other counts: over 1,000 packages, 27,000+ repos and 100M+ downloads, per [Upwind](https://www.upwind.io/?p=14565) [search-summary only]. Counts differ by vendor.
- **Shai-Hulud 2.0 mechanism.**
  - It moved from `postinstall` to **`preinstall`**, which widened impact to CI.
  - The payloads were `setup_bun.js`, a fake Bun installer, which ran `bun_environment.js` (over 10 MB, obfuscated) under the **Bun runtime** to evade Node-focused tooling.
  - It registered the infected host as a **self-hosted GitHub Actions runner named `SHA1HULUD`** and added a backdoor `discussion.yaml` workflow.
  - It dumped cloud secret managers (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).
  - It attempted a Docker breakout to get passwordless sudo.
  - Sources: [Wiz](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack); [Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/).
  - **Destructive fallback:** if it cannot steal or exfiltrate, it attempts to wipe the victim's home directory — [Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/). Wiz's page does not mention this.
  - About 15 malicious versions were **still on npm on November 27**, three days after detection — [Wiz](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack).

**2026** (Unit 42's running timeline was last updated July 15, 2026)

- **Axios, March 30–31, 2026.**
  - Malicious `axios@1.14.1` and `axios@0.30.4` were published. Last safe versions: 1.14.0 and 0.30.3.
  - They injected the dependency `plain-crypto-js@4.2.1`, which downloads multi-stage payloads including a RAT. The C2 indicator is `Sfrclak[.]com`.
  - CISA's preventive advice includes **`ignore-scripts=true` and `min-release-age=7` in `.npmrc`**, plus phishing-resistant MFA.
  - Source: [CISA alert, Apr 20, 2026](https://www.cisa.gov/news-events/alerts/2026/04/20/supply-chain-compromise-impacts-axios-node-package-manager) [primary].
  - Root cause: takeover of a lead maintainer's npm account. Attribution to North Korean actors comes from [Zscaler](https://www.zscaler.com/blogs/security-research/supply-chain-attacks-surge-march-2026) [search-summary only]. CISA itself states no attribution.
- **@bitwarden/cli@2026.4.0 ("Shai-Hulud: The Third Coming"), April 22, 2026.**
  - It was live for about 1.5 hours.
  - Mechanism: a `preinstall` hook (`node setup.mjs`) plus a `bw` bin entry, and it downloaded Bun v1.3.13.
  - It harvested cloud, CI and developer credentials, wormed via stolen npm tokens, and used a GitHub commit-search dead drop.
  - TeamPCP claimed the broader campaign.
  - Source: [Unit 42 npm threat landscape](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/) [primary vendor].
- **SAP wave (Mini Shai-Hulud), April 29, 2026.**
  - Packages: @cap-js/sqlite@2.2.2, @cap-js/postgres@2.2.2, @cap-js/db-service@2.10.1 and mbt@1.2.48, about 570k combined weekly downloads.
  - Root cause: the **OIDC trusted-publisher binding trusted the whole repository rather than one protected-branch workflow.**
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
- **TanStack wave, May 11, 2026. No stolen credentials were needed.**
  - The attack chained a `pull_request_target` "pwn request", GitHub Actions cache poisoning, and OIDC token extraction from runner memory via `/proc`.
  - It published 84 malicious artifacts in six minutes across 42 `@tanstack/*` packages.
  - By the end of the day: 373 malicious versions across 169 npm packages, including @uipath, @mistralai, @opensearch-project/opensearch and intercom-client, plus PyPI packages.
  - The packages **carried valid SLSA Build L3 provenance.**
  - The payload installs a background service that wipes the home directory if the stolen token is revoked.
  - The toolchain was posted publicly on GitHub on May 12, 2026.
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
- **@antv wave, May 19, 2026.**
  - The maintainer account `atool` was compromised.
  - 639 malicious versions across 323 packages were published in about one hour, including echarts-for-react (about 1.1M weekly downloads).
  - Mechanism: a `preinstall` running Bun.
  - It stole from password managers (1Password, Bitwarden, pass, gopass).
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
- **Red Hat @redhat-cloud-services ("Miasma"), June 1, 2026.**
  - 32 packages were affected.
  - A Red Hat employee's GitHub account was compromised, and orphan commits bypassed review. The release workflows got OIDC tokens, so the trojanized packages had **valid provenance**.
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
  - The GitHub account was compromised through a **malicious VS Code extension**, and no Red Hat products shipped the bad versions — [Red Hat RHSB-2026-006](https://access.redhat.com/security/vulnerabilities/RHSB-2026-006) [search-summary only].
  - Aikido counted 96 malicious versions — [Cybersecurity Dive](https://www.cybersecuritydive.com/news/dozens-red-hat-npm-packages-supply-chain-attack/821723/) [search-summary only].
- **AsyncAPI, July 14, 2026.**
  - Unprotected release branches accepted a direct malicious commit, which triggered the release workflows. They stole NPM_TOKEN and GITHUB_TOKEN.
  - Five trojanized packages were published, including @asyncapi/generator@3.3.1 and @asyncapi/specs@6.11.2.
  - Stage 2 is the Miasma RAT, with C2 fallbacks via an Ethereum contract, Nostr and BitTorrent DHT.
  - Unit 42 describes a case where **a GitHub Copilot workspace load triggered the loader with no manual `npm install`.**
  - Source: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
- **ChainDrop worm (keyv / cacheable / ecto), August 4, 2026.**
  - A malicious commit landed in the keyv GitHub repo, and `keyv@6.0.0` was published at 09:35 UTC.
  - "Hundreds" of packages were hit, some with over 150M weekly downloads.
  - Mechanism: a `preinstall` → `setup.mjs` loader, which downloads Bun and runs a detached second stage.
  - It harvests SSH, cloud, npm and Git credential files, environment variables, Actions runner memory, AWS SM/SSM, Kubernetes and Vault.
  - It **adds VS Code and Claude hooks into repos** so the loader re-runs when a project is opened.
  - Malicious versions were published from legitimate CI with **genuine SLSA provenance**.
  - It runs C2-supplied JavaScript via `eval`, and the C2 is resolved via an Ethereum contract.
  - Source: [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/) [primary vendor].
  - Count: at least 444 packages (1,381 versions) by August 5 — [Aikido](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack) [search-summary only]. Another count is "over 2,000 malicious versions" — [OpenSourceMalware](https://opensourcemalware.com/blog/new-npm-worm-keyv-cachable) [search-summary only]. Counts conflict.
  - Microsoft points to stolen maintainer credentials for initial access — [Microsoft Security blog](https://www.microsoft.com/en-us/security/blog/2026/08/04/chaindrop-supply-chain-compromise-anatomy-self-propagating-worm/) [search-summary only].
- **tensorlake, October 7–8, 2026 (ChainDrop/Shai-Hulud family, still active).**
  - The malicious 0.5.144 used a preinstall hook to start a credential-stealing worm.
  - Socket says it can persist after the dependency is removed.
  - Source: [The Hacker News](https://thehackernews.com/2026/10/tensorlake-npm-package-compromised-to.html) [search-summary only].
  - A separate non-worm campaign, MALFEX, used eight packages to deliver Windows RATs, with 40,767 downloads by October 1, 2026 per Checkmarx — same source [search-summary only].

**Common patterns, per the sources above**
- **Entry points:**
  - Maintainer phishing that captured TOTP: eslint-config-prettier, chalk/debug.
  - Stolen or harvested npm tokens: Shai-Hulud v1/v2, @antv.
  - CI/CD workflow flaws: Nx, TanStack, AsyncAPI.
  - Over-broad trusted-publisher bindings: SAP.
  - Compromised GitHub accounts, including via a malicious VS Code extension: Red Hat.
- **Execution:** install-time lifecycle scripts, increasingly `preinstall` with a Bun runtime. The exceptions were chalk/debug (a runtime browser payload) and Axios (a malicious transitive dependency).
- **Goal:** credential harvesting from developer machines and CI, worm propagation through stolen tokens, and sometimes destructive dead-man switches.
- **Provenance:** since May 2026, provenance/SLSA attestations do not mean a package is safe.
- Sources: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/).

### Inferences
- For a solo macOS developer, the main risk is **install-time code execution on the author's own machine**, which holds SSH keys, `~/.npmrc`, GitHub credentials, cloud configs, password-manager CLIs and AI-CLI configs. It is not the generated HTML.
- The 2026 worms also plant **editor and AI-agent hooks** (VS Code tasks, Claude hooks). After any suspected exposure, check repo-level `.vscode/`, `.claude/` and `.github/workflows/` files, not just `node_modules`.
- Exposure windows were often hours: Bitwarden about 1.5 h, Nx about 8 h, TanStack minutes to a day. But some malicious versions survived for days (Shai-Hulud 2.0 had about 15 versions still live 3 days later). So a **7-day** cooldown is more robust than 1 day.
- Of the project's likely dependencies, only chalk/debug-style utilities have been directly hit. I found no reports in these sources of markdown-it, shiki, yaml, sharp, katex or codemirror being compromised. That absence is not proof; see Gaps.

### Gaps
- I could not confirm the "Scavenger" malware name for the July 2025 eslint-config-prettier payload. It appears only as an IOC repo tag in search results.
- I did not fetch Nx's own post-mortem, so I cannot confirm whether an npm token was exfiltrated via the workflow; Wiz describes only the workflow injection.
- Exact package and version counts for Shai-Hulud 2.0 and ChainDrop differ by vendor.
- I did not check whether any of the project's specific dependencies (markdown-it, shiki, yaml, sharp, katex, codemirror) appear in the ChainDrop dynamic list or the tensorlake-wave list. The Datadog CSV linked from its article should be checked.
- I found no specific September 2026 worm report. Coverage for September–October 2026 rests on search summaries.

---

## 2. npm / GitHub platform responses (tokens, 2FA, trusted publishing, provenance, npm 12) — with dates

### Takeaway
Between July 2025 and September 2026, npm removed long-lived classic tokens and capped granular token lifetimes. It made OIDC trusted publishing generally available, and in **npm CLI 12.0.0 (July 8, 2026)** it stopped running dependency install scripts by default and set git and remote-URL dependencies to "none". These changes mostly protect publishers. For a consumer, the most relevant are the npm 11.10+/12 client settings covered in Section 3.

### Cited Findings
- **July 31, 2025: trusted publishing (OIDC) became generally available** for GitHub Actions (GitHub-hosted runners) and GitLab CI/CD (gitlab.com shared runners). It requires **npm CLI ≥ 11.5.1**, and provenance attestations are generated automatically, so `--provenance` is no longer needed. Provenance is unavailable for private source repos. Source: [GitHub changelog](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/).
- **September 22, 2025: GitHub published its plan.** It would:
  - require 2FA for local publishing and remove the option to bypass it;
  - limit granular tokens to a seven-day lifetime;
  - deprecate classic tokens;
  - **deprecate TOTP 2FA in favor of FIDO/WebAuthn**;
  - expand trusted-publishing providers;
  - make publishing disallow tokens by default.
  - No dates were given. Source: [GitHub blog](https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/).
- **October 10, 2025: changelog on authentication and token changes.** It recommends trusted publishing, and says support for other CI providers (Azure Pipelines, CircleCI) was still being added. Source: [GitHub changelog](https://github.blog/changelog/2025-10-10-strengthening-npm-security-important-changes-to-authentication-and-token-management).
- **November 5, 2025: classic token creation disabled.**
  - Write-enabled granular tokens require 2FA by default, with an optional "Bypass 2FA" setting for CI.
  - Write tokens are capped at a **90-day** maximum lifetime, not the 7 days announced in September.
  - Existing classic tokens had a November 19 cutoff.
  - Source: [GitHub changelog](https://github.blog/changelog/2025-11-05-npm-security-update-classic-token-creation-disabled-and-granular-token-changes/).
- **December 9, 2025: all classic tokens were permanently revoked.** `npm login` now issues **two-hour session tokens**, and CLI token management was added. Source: [GitHub changelog](https://github.blog/changelog/2025-12-09-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/).
- **February 11, 2026: npm CLI 11.10.0 added `min-release-age`.** Source: [npm CLI CHANGELOG](https://raw.githubusercontent.com/npm/cli/latest/CHANGELOG.md).
- **June 9, 2026: GitHub pre-announced npm v12 breaking changes (estimated July 2026).**
  - Dependency install scripts would require `allowScripts`; warnings are available from **npm 11.16.0**.
  - `--allow-git` would default to `none`; the setting has been available since **11.10.0**.
  - `--allow-remote` would default to `none`; the setting has been available since **11.15.0**.
  - Source: [GitHub changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/).
- **July 8, 2026: npm CLI 12.0.0 released.**
  - "Dependency lifecycle scripts are now blocked by default unless allowed by the root package's `allowScripts` policy."
  - `allow-git` and `allow-remote` now default to `"none"`.
  - **It requires node `^22.22.2 || ^24.15.0 || >=26.0.0`.**
  - It removes `npm shrinkwrap` and `npm adduser`.
  - **Unknown `.npmrc` keys and unknown CLI flags now throw errors** instead of warnings.
  - The root `preinstall` now runs before dependencies are installed.
  - Sources: [npm CLI v12.0.0 release](https://api.github.com/repos/npm/cli/releases/tags/v12.0.0); [CHANGELOG](https://raw.githubusercontent.com/npm/cli/latest/CHANGELOG.md).
- **September 22, 2026: npm 12.1.0 and 11.20.0** added "read-write-stage-only" granular access tokens and provenance-file precedence fixes. **September 30, 2026: npm 12.2.0** is the latest release and adds OIDC authentication for dist-tag commands. Source: [npm/cli releases](https://github.com/npm/cli/releases).
- Secondary coverage says npm 12 also deprecated granular tokens that bypass 2FA — [The Hacker News, July 2026](https://thehackernews.com/2026/07/npm-12-disables-install-scripts-by.html) [search-summary only; the page returned 403 and was not verified]. The v12.0.0 release notes do not mention token changes.
- **Limits of provenance.** Packages in the TanStack, Red Hat and ChainDrop waves carried valid SLSA provenance because attackers used the legitimate pipelines. Datadog says provenance shows where a package was built, not whether it is safe. Sources: [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/); [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/).

### Inferences
- The token changes reduce the value of stolen tokens and the worms' ability to spread. They do nothing to stop a compromised version, published by a legitimate pipeline or a phished maintainer, from reaching consumers. Consumer-side controls (age gates, script blocking, lockfiles) remain necessary.
- Because npm 12 rejects unknown `.npmrc` keys, a project `.npmrc` should contain only keys valid for the npm version in use. This matters if the author switches between npm 11 and npm 12.

### Gaps
- I did not verify whether TOTP 2FA has actually been retired on npm as of October 2026, or whether "publishing disallows tokens by default" has shipped.
- I did not verify whether CircleCI and other providers became trusted publishers in 2026.
- I did not confirm the exact npm version bundled with the latest Node 24.x (v24.21.0). The npm 12 engine range allows Node ≥ 24.15.0.

---

## 3. Mitigations for a consumer project — exact syntax and the versions that support them

### Takeaway
Use a committed lockfile and `npm ci`, block dependency install scripts by default with a small explicit allowlist, and set a release-age cooldown of about 7 days. Those three controls would have blocked or delayed nearly every 2025–2026 incident above. As of October 2026, **pnpm 11** has the safest out-of-the-box defaults: scripts blocked, a 1-day age gate on, and exotic sub-dependencies blocked. **npm 12** now blocks scripts by default but still has **no default age gate**, so set `min-release-age` yourself.

### Cited Findings

**npm (11.10+ / 12.x)**

The config keys below come from the npm docs ([v11 config](https://docs.npmjs.com/cli/v11/using-npm/config), page for 11.21.0; [v12 config](https://docs.npmjs.com/cli/v12/using-npm/config), page for 12.2.0):

| Key | Type / default | What it does | Version |
|---|---|---|---|
| `min-release-age` | number of **days**; default `null` | "only versions that were available more than the given number of days ago will be installed" | 11.10.0+ ([CHANGELOG](https://raw.githubusercontent.com/npm/cli/latest/CHANGELOG.md)) |
| `min-release-age-exclude` | strings, repeatable | names or minimatch globs exempt from `min-release-age` and `before` | in v11/v12 docs; exact version not verified |
| `before` | date | installs only versions available on or before the date | — |
| `ignore-scripts` | default `false` | when `true`, npm does not run package.json scripts. In v12, explicit `npm test` / `npm start` still run but their pre/post scripts do not, and `.npm-extension` execution is disabled. | — |
| `allow-scripts` | comma-separated string | packages whose install scripts may run; meant for `npx` and `-g` contexts | — |
| `strict-allow-scripts` | default `false` | turns unreviewed install scripts from a warning into a hard error | — |
| `dangerously-allow-all-scripts` | default `false` | migration escape hatch | — |
| `allow-git` | `all` / `none` / `root` | controls git dependencies; default `all` in v11, **`none` in v12** | 11.10.0+ |
| `allow-remote` | `all` / `none` / `root` | controls tarball-URL dependencies; **`none` in v12** | 11.15.0+ ([GitHub changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)) |
| `save-exact` | default `false` | writes exact versions to package.json | — |
| `package-lock` | default `true` | when `false`, ignores package-lock.json | — |

- **The `allowScripts` field in package.json (npm 11.16+ warns, npm 12 enforces).**
  - Commands: `npm approve-scripts <pkg…>` (pinned to the installed version by default), `npm approve-scripts --no-allow-scripts-pin <pkg>`, `npm approve-scripts --all`, `npm approve-scripts --allow-scripts-pending` (list only), and `npm deny-scripts <pkg>`. "Existing `false` entries always win."
  - Covered scripts: `preinstall`, `install`, `postinstall`, and `prepare` for non-registry sources.
  - Source: [npm v12 approve-scripts](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts).
  - The v12.0.0 release notes instead name `npm install-scripts approve` followed by `npm rebuild` — [release](https://api.github.com/repos/npm/cli/releases/tags/v12.0.0). The v11 docs also have a [`npm install-scripts`](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts) page. Both command spellings appear in official material.
  - The docs describe the entry forms (name: `true`, `pkg@version`: `true`, name: `false`) but show no literal JSON. This shape is inferred:
    ```json
    { "allowScripts": { "sharp@0.35.5": true, "some-pkg": false } }
    ```
- **GitHub's recommended migration** ([changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)):
  1. Upgrade to npm 11.16.0 or later.
  2. Run your normal install and review the warnings.
  3. `npm approve-scripts --allow-scripts-pending`
  4. `npm approve-scripts` for trusted packages.
  5. `npm deny-scripts` for the rest.
  6. Commit package.json.
- **CISA's recommended `.npmrc` lines** (Axios alert, April 2026): `ignore-scripts=true` and `min-release-age=7`. Source: [CISA](https://www.cisa.gov/news-events/alerts/2026/04/20/supply-chain-compromise-impacts-axios-node-package-manager).
- **Third-party notes on `min-release-age`.**
  - User-wide: `npm config set min-release-age 7 --location=user`.
  - One-off bypass: `npm install --min-release-age=0`.
  - `npm config get min-release-age` may print `null` even when the setting is active, because it is converted internally to `before`.
  - Source: [Classmethod blog](https://dev.classmethod.jp/articles/npm-min-release-age-setup/) [third-party, search-summary only].
  - A registry proxy that rewrites timestamps (ProGet was reported) can defeat it — [Inedo forum](https://forums.inedo.com/topic/5719.rss) [search-summary only].
- **`npm audit signatures`** verifies registry ECDSA (`ecdsa-sha2-nistp256`) signatures and provenance attestations of installed packages. `--json --include-attestations` outputs the bundles. The docs advise running a newer npm than the one bundled with Node for full verification. Source: [npm audit docs](https://docs.npmjs.com/cli/v11/commands/npm-audit).
  - **Caveat:** valid provenance was present on several 2026 malicious releases — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).
- **`npm ci`, lockfiles and integrity hashes** are part of Unit 42's mitigation list, alongside a 24–72 h cooldown via a registry proxy and `ignore-scripts=true` — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/). Aikido's chalk/debug remediation also says to use a lockfile with pinned versions — [Aikido](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised).

**pnpm (10.x → 11.x)**

Settings go in `pnpm-workspace.yaml` or the global `config.yaml`. **pnpm 11 no longer reads non-auth settings from `.npmrc`.** Sources: [pnpm settings](https://pnpm.io/settings); [pnpm 11 release blog](https://pnpm.io/blog/releases/11.0).

- **pnpm 10.0.0 (January 7, 2025)** stopped running dependency lifecycle scripts by default. They were allowed through `pnpm.onlyBuiltDependencies` in package.json, e.g. `"onlyBuiltDependencies": ["fsevents"]`. Source: [pnpm v10.0.0 release](https://github.com/pnpm/pnpm/releases/tag/v10.0.0). The page omits the year; 2025 is inferred from the 10.x/11.x timeline.
- **pnpm 11.0.0 (April 28, 2026)** made these changes:
  - `minimumReleaseAge` defaults to `1440` (minutes, i.e. 1 day).
  - `allowBuilds` replaces `onlyBuiltDependencies`, `neverBuiltDependencies` and `ignoredBuiltDependencies`, which were **removed**.
  - `strictDepBuilds` and `blockExoticSubdeps` now default to `true`.
  - It requires Node ≥ 22.
  - Sources: [pnpm v11.0.0 release](https://github.com/pnpm/pnpm/releases/tag/v11.0.0); [pnpm 11 blog](https://pnpm.io/blog/releases/11.0).
- **Supply-chain settings** ([dependency-resolution docs](https://pnpm.io/settings/dependency-resolution)):

  | Setting | Unit / default | Added | Notes |
  |---|---|---|---|
  | `minimumReleaseAge` | **minutes**; default 1440 in v11 (0 before) | 10.16.0 | — |
  | `minimumReleaseAgeExclude` | names, patterns or versions | 10.16.0 | patterns 10.17, versions 10.19 |
  | `minimumReleaseAgeStrict` | boolean | 11.0.0 | `true` when you set the age yourself |
  | `minimumReleaseAgeIgnoreMissingTime` | default `true` | 11.0.0 | — |
  | `trustPolicy` | `no-downgrade` / `off`; default off | 10.21.0 | fails if a package's trust level drops vs. previous releases |
  | `trustPolicyExclude` | package selectors | 10.22.0 | — |
  | `trustLockfile` | default `false` | 11.3.0 | — |
  | `blockExoticSubdeps` | default `true` | 10.26.0 | only direct deps may use git, tarball and other exotic sources |

  Example from the docs:
  ```yaml
  minimumReleaseAge: 10080        # 7 days
  minimumReleaseAgeExclude:
    - '@myorg/*'
  trustPolicy: no-downgrade
  ```
- **Build settings** ([build docs](https://pnpm.io/settings/build)):
  - `allowBuilds` (10.26.0+) is a map of matcher to `true`/`false`. "Packages not listed in `allowBuilds` are disallowed by default."
  - `strictDepBuilds` (10.3.0+, default `true`) makes the install fail with `ERR_PNPM_IGNORED_BUILDS` when builds are unreviewed.
  - `dangerouslyAllowAllBuilds` (10.9.0+, default `false`).
  - `pnpm approve-builds` writes entries.
  - Migration: `pnpx codemod run pnpm-v10-to-v11`.
  - Example:
    ```yaml
    allowBuilds:
      esbuild: true
      core-js: false
      nx@21.6.4 || 21.6.5: true
    ```

**Yarn Berry (4.x)** — [.yarnrc.yml reference](https://yarnpkg.com/configuration/yarnrc)
- `enableScripts` defaults to `false`: "Yarn will not execute the `postinstall` scripts from third-party packages." Per-package overrides go in `dependenciesMeta`. **The default became `false` in v4.14.0 (released April 16; year not shown, presumably 2026)** — [Yarn releases](https://github.com/yarnpkg/berry/releases).
- `npmMinimalAgeGate` is the minimum package age based on the npm publish date. `npmPreapprovedPackages` exempts packages from all gates.
  - **The default is unclear.** The yarnrc docs page shows `"1w"`. The release notes say **v4.15.0 (May 19) "Makes `npmMinimalAgeGate: 1d` the default"**, followed by two docs fixes to the default value (4.16.0, 4.17.0). Sources: [yarnrc docs](https://yarnpkg.com/configuration/yarnrc); [Yarn releases](https://github.com/yarnpkg/berry/releases).
  - Per-scope gates came in 4.17.0. The latest release is 4.18.1 (September 24).
- The gate was first introduced in 4.10, which accepted only minutes as a number. Duration strings such as `7d` arrived in 4.11 — [third-party summaries](https://lilting.ch/en/articles/pnpm-11-minimum-release-age-default-shai-hulud-defense) [search-summary only].
- `enableHardenedMode` (default `true` per docs) validates the lockfile against the registry. `approvedGitRepositories` restricts git sources — [yarnrc docs](https://yarnpkg.com/configuration/yarnrc).

**Bun**
- Bun "does not execute arbitrary lifecycle scripts by default". It runs them only for packages on a built-in default allowlist of popular packages, or for packages in `trustedDependencies` in package.json. Defining `trustedDependencies` **replaces** the default list. `bun install --ignore-scripts`, or `[install] ignoreScripts = true` in bunfig.toml, disables all scripts. Source: [Bun lifecycle docs](https://bun.sh/docs/pm/lifecycle).
- `install.minimumReleaseAge` is in **seconds**, default `null`, e.g. `minimumReleaseAge = 259200` for 3 days. `install.minimumReleaseAgeExcludes = ["typescript"]`. `[install.security] scanner = "<pkg>"` sets a pre-install scanner hook. Source: [bunfig docs](https://bun.sh/docs/runtime/bunfig).
- The Bun version that introduced `minimumReleaseAge` is not stated in the docs.

**Deno**
- Deno does not run npm lifecycle scripts by default. To allow them: `deno approve-scripts npm:<pkg>`, or `deno install --allow-scripts=npm:<pkg>`, or `"allowScripts": ["npm:better-sqlite3"]` in deno.json. Scripts run only with a local `node_modules` directory. Sources: [Deno lifecycle tutorial](https://docs.deno.com/examples/npm_lifecycle_scripts_tutorial/); [Deno Node/npm docs](https://docs.deno.com/runtime/fundamentals/node/).

**Unit mismatch to watch:** npm uses days, pnpm uses minutes, Bun uses seconds, and Yarn uses duration strings (or minutes in 4.10). Sources: the docs above; [mcollina gist](https://gist.github.com/mcollina/b294a6c39ee700d24073c0e5a4e93104) [search-summary only].

**Bot and wrapper tools**
- **Dependabot `cooldown`** (`dependabot.yml`):
  - Keys: `default-days`, `semver-major-days`, `semver-minor-days`, `semver-patch-days`, `include` and `exclude` (up to 150 entries each, `*` wildcards; `exclude` wins).
  - "If omitted, Dependabot applies a default cooldown of 3 days."
  - **It applies only to version updates, not security updates.**
  - Source: [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference).
  - The docs page I fetched showed no example YAML; this one is built from the documented keys:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: "npm"
        directory: "/"
        schedule: { interval: "weekly" }
        cooldown:
          default-days: 7
          semver-major-days: 30
    ```
- **Socket Firewall Free (`sfw`).**
  - Install with `npm i -g sfw`, then run `sfw npm install`. It supports npm, yarn and pnpm.
  - It needs no API key, and it works as a network-layer proxy that blocks known-malicious packages.
  - It collects anonymous telemetry, and its macOS binaries are unsigned.
  - Source: [Socket Firewall Free docs](https://docs.socket.dev/docs/socket-firewall-free) [search-summary only].
  - It launched around September 30, 2025 — [The Register](https://theregister.com/2025/09/30/socket_will_block_it_with) [URL date only].
- **Aikido Safe Chain.**
  - Install with `npm install -g @aikidosec/safe-chain`, then `safe-chain setup` (shell aliases plus a local proxy).
  - The README says minimum package age is **48 h by default**. The licence is GPL-3.0-or-later.
  - Source: [GitHub AikidoSec/safe-chain](https://github.com/AikidoSec/safe-chain) [search-summary only].
- **Datadog Supply-Chain Firewall (SCFW)** is open source and blocks known-malicious packages at install time — [Datadog](https://securitylabs.datadoghq.com/articles/npm-worm-compromises-popular-npm-packages/).

**Packages that need install scripts (sharp, esbuild)**
- sharp's install docs say "At install time, package managers will automatically select prebuilt binaries" and warn to "ensure your package manager is configured to install optional dependencies". Building from source is a separate manual step: `npm explore sharp -- npm run build`. The latest sharp listed is v0.35.5. Source: [sharp install docs](https://sharp.pixelplumbing.com/install).
- npm 12 coverage notes native-build packages (sharp, bcrypt, canvas, sqlite3, esbuild) as the ones most likely to be affected by script blocking — [secondary roundup](https://www.buildmvpfast.com/blog/npm-v12-disable-install-scripts-supply-chain-2026) [search-summary only].
- A critique: blocking install scripts can push malware into module code instead — [The Register](https://www.theregister.com/a/5253453) [search-summary only].
  - Chalk/debug is an example: it was a runtime payload with no install script — [Aikido](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised).
  - AsyncAPI is another: a Copilot workspace load triggered the loader without `npm install` — [Unit 42](https://unit42.paloaltonetworks.com/monitoring-npm-supply-chain-attacks/).

### Inferences
- **Recommended npm-based setup for this project** (Node ≥ 24.15 with npm ≥ 12, or npm ≥ 11.16 for warnings). This is my synthesis; every key comes from the docs above:
  ```ini
  # .npmrc (project root) — npm 12 throws on unknown keys, so keep only valid ones
  min-release-age=7
  allow-git=none
  allow-remote=none
  save-exact=true
  # Optional belt-and-braces on npm 11.x:  ignore-scripts=true
  # On npm 12, prefer the allowScripts policy plus strict-allow-scripts=true over ignore-scripts
  ```
  Then:
  1. Commit `package-lock.json`.
  2. Install with `npm ci`, never a bare `npm install` on a clean checkout.
  3. Run `npm approve-scripts --allow-scripts-pending` to see which dependencies (if any) have install scripts.
  4. Approve only pinned versions.
  5. Run `npm audit` and `npm audit signatures` as a sanity check, knowing that provenance is no longer a safety signal.
- **Why `ignore-scripts=true` costs little here.** markdown-it, shiki, yaml, katex and codemirror are pure JS/WASM. sharp's docs suggest prebuilt binaries come through optional dependencies. So this dependency set probably needs zero approved install scripts. This needs confirming locally with `--allow-scripts-pending`, because I did not verify each package's `scripts` field.
- **Downside of `ignore-scripts=true`:** it also suppresses the project's own pre/post hooks. npm 12's `allowScripts` policy is more targeted.
- **Safest defaults as of October 2026, roughly ranked:**
  1. **pnpm 11** — scripts blocked with a strict failure, a 1-day age gate on by default, exotic sub-dependencies blocked, and an optional `trustPolicy`.
  2. **Yarn 4.15+** — scripts off and a 1d age gate by default; the default value is ambiguous in the docs.
  3. **Deno** — scripts off plus runtime permissions; see Section 4.
  4. **npm 12** — scripts blocked and git/remote set to none, but no default age gate.
  5. **Bun** — scripts blocked except a built-in allowlist, and no default age gate.
- For any of them, raise the age gate to about **7 days** given the multi-day survival in Shai-Hulud 2.0.
- With 5–10 direct dependencies, a solo author could also use **Dependabot or Renovate with a cooldown**, or simply update by hand on a schedule (for example monthly, after a 7-day cooldown) and read the lockfile diff. Wrapper tools (sfw, Safe Chain) are themselves npm-installed global dependencies, so adding them is a trade-off rather than pure gain.

### Gaps
- **npm `min-release-age-exclude`:** I did not verify which npm version introduced it.
- **Renovate `minimumReleaseAge`:** I did not research its syntax.
- **OSV-Scanner:** I did not research its version or syntax.
- **Literal JSON format of `allowScripts`:** the npm v12 docs I retrieved show no example, and the shape above is inferred.
- **Yarn's current default for `npmMinimalAgeGate`:** "1w" in the docs vs. "1d" in the 4.15.0 release notes. Unresolved, and the years of the 4.14–4.18 releases are not shown on the releases page.
- **Bun's `minimumReleaseAge`:** I did not verify the introducing version or the size of the default trusted-dependency list.
- **sharp's current `scripts` field:** I did not inspect whether recent sharp (0.34/0.35) still declares an `install` script; the docs page is silent.
- **Socket and Aikido tool claims** rest on search summaries, not fetched docs.

---

## 4. Sandboxing alternatives: Deno permissions + `npm:` specifiers, and Node's permission model

### Takeaway
Deno is the only option here that can **deny network and environment access at runtime** to npm code. It applies its permission system to npm packages, so `deno run --allow-read=. --allow-write=./dist` with no `--allow-net` would stop a malicious dependency's runtime payload from exfiltrating anything. This advantage disappears if `--allow-ffi` (native addons such as sharp) or `--allow-run` is granted. Node 24's permission model is **Stable**, but in Node 24 it has **no network restriction**. Node explicitly says it is a "seat belt" that "does not protect against malicious code", and it has had several bypass CVEs in 2026. Neither tool sandboxes install scripts run by npm; those must be handled by script blocking.

### Cited Findings
- **Deno defaults:** "Deno is secure by default"; no file, network, environment or subprocess access unless granted.
  - Scoped grants: `--allow-read=./data`, `--allow-net=example.com`, `--allow-env=API_KEY`. `--deny-*` overrides `--allow-*`.
  - `-A` "turns the sandbox off entirely."
  - Source: [Deno security docs](https://docs.deno.com/runtime/fundamentals/security/).
- **Deno escape hatches:**
  - With `--allow-run`, "A subprocess runs as a separate program with its own permissions."
  - With `--allow-ffi`, "a native library runs as compiled machine code in the same process."
  - Combining `--allow-write` and `--allow-run` can overwrite an allowed executable.
  - "All code executing on the same thread shares the same privilege level."
  - Source: [Deno security docs](https://docs.deno.com/runtime/fundamentals/security/).
- **Deno and npm packages:** "npm packages run under the same permission system as the rest of your code"; "Deno's permission system applies to CommonJS code too"; native addons need `--allow-ffi`. Source: [Deno Node/npm docs](https://docs.deno.com/runtime/fundamentals/node/).
- **Node 24 permission model** ([Node v24.21.0 docs](https://nodejs.org/docs/latest-v24.x/api/permissions.html)):
  - Status is **"Stability: 2 – Stable"**. It was added in v20.0.0, and experimental status was removed in v23.5.0 / v22.13.0.
  - Flags: `--permission` (enforce), `--permission-audit` (log-only via diagnostics channels), `--allow-fs-read=<path>`, `--allow-fs-write=<path>`, `--allow-child-process`, `--allow-worker`, `--allow-addons`, `--allow-wasi` and `--allow-openssl-store`.
  - A config-file form is available via `--experimental-config-file` / `node.config.json` with a `"permission"` object.
  - Runtime API: `process.permission.has()` and `process.permission.drop()`.
  - **The Node 24 docs list no network permission flag.**
  - Example: `node --permission --allow-fs-write=/tmp/ --allow-fs-read=/tmp/ index.js`.
- **Node threat model, verbatim:** "This feature does not protect against malicious code. According to the Node.js Security Policy, Node.js trusts any code it is asked to run." "Malicious code can bypass the permission model and execute arbitrary code without the restrictions imposed by the permission model." Source: [Node v24 permissions docs](https://nodejs.org/docs/latest-v24.x/api/permissions.html).
- **Documented Node limitations** (same source):
  - Symlinks are followed outside granted paths.
  - Existing file descriptors bypass the model.
  - Only `node:fs` is covered; for example, `node:sqlite` is not.
  - The model is not inherited by worker threads.
  - Startup flags such as `--env-file` read files before the model initializes.
  - `process._debugProcess(pid)` is ungated, so a sandboxed process can signal another Node process of the same user to open its inspector.
- **`--allow-net` exists only in newer lines.** It is experimental in Node 25/26; CVEs refer to it for 25.x and 26.x only. Sources: [Node March 2026 security release](https://nodejs.org/en/blog/vulnerability/march-2026-security-releases) ("Note that `--allow-net` is experimental"); [June 2026 release](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases).
- **Permission-model bypass CVEs affecting 24.x:**
  - **2026-01-13:** CVE-2025-55130 (**High**), where crafted relative symlinks bypass `--allow-fs-read`/`--allow-fs-write`. Also CVE-2025-55132 (Low), `fs.futimes()` with read-only permission. Source: [Jan 2026 release](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases).
  - **2026-03-24:** CVE-2026-21715 (Low), `fs.realpathSync.native()` skips read checks. CVE-2026-21716 (Low), `FileHandle.chmod/chown` skip write checks. Source: [Mar 2026 release](https://nodejs.org/en/blog/vulnerability/march-2026-security-releases).
  - **2026-06-18:** CVE-2026-48617 (Low), `process.report.writeReport()` path misvalidation. CVE-2026-48935 (Low), `FileHandle.utimes()` with read-only permission. Source: [Jun 2026 release](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases).
  - **2026-07-29:** CVE-2026-58043 (**High**), where radix-tree prefix matching lets a grant for one path reach paths outside the allowlist. CVE-2026-56847 (Low), trace events write outside `--allow-fs-write`. CVE-2026-58039 (Low), `process.report` writes outside `--allow-fs-write`. Fixed in **24.18.1**. Source: [Jul 2026 release](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases).

### Inferences
- **The Node permission model is usable for this CLI as a seat belt.** Example:
  ```bash
  node --permission \
    --allow-fs-read="$PWD" \
    --allow-fs-write="$PWD/dist" \
    src/cli.ts deck.md
  ```
  - Run with `--permission-audit` first to discover the paths that are actually needed.
  - Adding sharp requires `--allow-addons`, and native code can ignore the model entirely.
  - This limits accidental or naive writes, but **cannot stop exfiltration over the network in Node 24.**
  - Given the 2026 bypass CVEs and the explicit "not for malicious code" stance, it should not be presented as a supply-chain defense.
- **Deno meaningfully reduces runtime blast radius for this kind of tool.** The tool needs only read access to the source folder and write access to the output folder. It needs no network, no environment variables and no subprocesses at build time, and it has a pure-JS/WASM dependency set (markdown-it, shiki, yaml, katex, codemirror). A payload in module code (chalk/debug-style) or a stealer would be denied `~/.ssh`, `~/.npmrc` and network access unless they are granted.
  - Caveats: sharp would need `--allow-ffi`, which defeats the sandbox, so avoid sharp or run image processing separately. Deno's lifecycle-script blocking prevents the install-time vector. Deno's own permission enforcement may have bugs of its own; that was not researched.
- **A Node-only alternative with similar effect:** run installs with scripts blocked, and run the build under the macOS sandbox or in a container with no network. These were not researched here and should be treated as out-of-scope suggestions.

### Gaps
- I did not research Deno permission-bypass CVEs in 2025–2026, the exact Deno version (2.x) supporting `allowScripts`/`approve-scripts`, or whether Deno applies permissions to `node:child_process`; the docs page is silent on that.
- I did not verify whether shiki's WASM (oniguruma) loading needs any extra Node or Deno permission. It probably needs only file read for the `.wasm` file.

---

## 5. Node.js 24 security posture and TypeScript type stripping

### Takeaway
Node.js 24 ("Krypton") is **Active LTS until 2026-10-20**, then **Maintenance LTS until end-of-life on 2028-04-30**. The latest 24.x shown on nodejs.org is v24.21.0. It received regular security releases in 2025–2026; most High issues are HTTP/2, TLS and crypto DoS or authentication bugs that matter little for an offline local CLI. **Type stripping is marked Stable as of v24.12.0** and no longer warns as of v24.3.0. No 2025–2026 Node security advisory I reviewed mentions type stripping. Its "risks" are behavioral: no type checking, `tsconfig` ignored, and `.ts` refused under `node_modules`.

### Cited Findings
- **Release schedule** ([nodejs/release](https://github.com/nodejs/release)):
  - 24.x: released 2025-05-06; Active LTS from 2025-10-28; Maintenance from **2026-10-20**; **EOL 2028-04-30**.
  - 22.x: Maintenance LTS, EOL 2027-04-30.
  - 20.x: EOL 2026-04-30.
  - 26.x: Current since 2026-05-05; LTS from 2026-10-28; EOL 2029-04-30.
  - No release-cadence change is announced on that page.
- The latest LTS shown in nodejs.org navigation in October 2026 is **v24.21.0** — [Node July 2026 advisory page nav](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases).
- **24.x security releases** (index at [nodejs.org/en/blog/vulnerability](https://nodejs.org/en/blog/vulnerability)):

  | Date | Fixed 24.x | What it fixed | Source |
  |---|---|---|---|
  | 2025-05-14 | **24.0.2** | CVE-2025-23166 (High): async crypto `DeriveBits` throwing from a background thread, a remote crash | [May 2025](https://nodejs.org/en/blog/vulnerability/may-2025-security-releases) |
  | 2025-07-15 | **24.4.1** | CVE-2025-27210 (High): Windows device-name `path.normalize` traversal. CVE-2025-27209 (High, 24.x only): V8 rapidhash HashDoS | [Jul 2025](https://nodejs.org/en/blog/vulnerability/july-2025-security-releases) |
  | 2026-01-13 | **24.13.0** | 3 High / 4 Medium / 1 Low across lines, including the `Buffer.alloc` non-zero-fill-under-vm-timeout bug (CVE-2025-55131), the permission-model symlink escape (CVE-2025-55130), and an HTTP/2 crash (CVE-2025-59465) | [Jan 2026](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases) |
  | 2026-03-24 | **24.14.1** | 2 High: SNICallback crash, `__proto__` header crash. Also Medium: HMAC timing, V8 integer-string HashDoS (CVE-2026-21717), and others | [Mar 2026](https://nodejs.org/en/blog/vulnerability/march-2026-security-releases) |
  | 2026-06-18 | **24.17.0** | High: WebCrypto AES 2 GiB overflow DoS, TLS wildcard Unicode-dot authentication bypass. Plus several Medium/Low, including permission-model issues | [Jun 2026](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases) |
  | 2026-07-29 | **24.18.1** | High: HTTP/2 memory exhaustion, nghttp2 use-after-free, permission-model prefix bypass. Plus Medium/Low | [Jul 2026](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases) |

- The nodejs.org vulnerability index (first page, fetched 2026-10-14) listed **July 29, 2026 as the most recent security release**. No 24.x security release appears for August through mid-October 2026 — [Node vulnerability blog](https://nodejs.org/en/blog/vulnerability).
- **TypeScript type stripping in v24 docs** ([Node v24.21.0 TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)):
  - Status is **"Stability: 2 – Stable"**.
  - History: added in v22.6.0; `--experimental-transform-types` in v22.7.0; enabled by default in **v23.6.0**; no experimental warning from **v24.3.0**; **stable from v24.12.0**.
  - Behavior: "Node.js will replace TypeScript syntax with whitespace, and **no type checking is performed**."
  - "Node.js ignores `tsconfig.json` files", so `paths` aliases and down-levelling are unsupported.
  - Non-erasable syntax (enums, runtime namespaces, parameter properties, import aliases) errors unless `--experimental-transform-types` is passed.
  - Decorators produce a parser error, and `.tsx` is unsupported.
  - Type-only imports need `import type`, and file extensions are mandatory (`./file.ts`).
  - Not supported in the REPL, `--check` or `inspect`.
  - `--no-strip-types` disables stripping.
  - **"Node.js refuses to handle TypeScript files inside folders under a `node_modules` path."**
  - The recommended tsconfig for type-checking alongside is: `"noEmit": true, "target": "esnext", "module": "nodenext", "rewriteRelativeImportExtensions": true, "erasableSyntaxOnly": true, "verbatimModuleSyntax": true` (TypeScript ≥ 5.8).
  - The page contains no security warnings.
- **Security advisories and type stripping:** none of the six 24.x-relevant security release pages reviewed (May 2025, July 2025, January 2026, March 2026, June 2026, July 2026) mention TypeScript or type stripping. Sources: the advisory links above.
- **npm 12 compatibility:** npm 12 needs Node ≥ 24.15.0 on the 24 line — [npm v12.0.0 release](https://api.github.com/repos/npm/cli/releases/tags/v12.0.0).

### Inferences
- **Practical posture for this project:**
  - Pin to the latest 24.x (≥ 24.18.1 for all known fixes; 24.21.0 is current). Node 24 remains supported until April 2028, though it gets only security and critical fixes after 2026-10-20.
  - Moving to Node 26 LTS (from 2026-10-28) is optional.
  - Most 2025–2026 Node CVEs concern servers (HTTP/2, TLS, proxies) and have little relevance to an offline file-to-file CLI. Exceptions are the HashDoS fixes for `JSON.parse` and string hashing on untrusted input, which matter only if decks come from untrusted sources, and the permission-model fixes, which matter if `--permission` is used.
- **Type-stripping risk profile:**
  - (a) No type checking means TypeScript types give **no runtime validation** of untrusted input such as YAML front-matter or Markdown; validate explicitly.
  - (b) Run `tsc --noEmit` with `erasableSyntaxOnly` in development to catch the syntax Node rejects.
  - (c) Because Node refuses `.ts` in `node_modules`, dependencies must ship JS. This does not open a new attack path: malicious JS in a dependency runs regardless.
  - (d) Running `.ts` directly removes the need for a runtime transpiler (tsx, ts-node, esbuild) in the execution path. That shrinks the dependency tree, and so the supply-chain surface. TypeScript itself is only a dev dependency for checking.
  - (e) Avoid `--experimental-transform-types`. It is still flagged experimental by name, and the docs give no stability marker for it.

### Gaps
- I did not verify the Node 22.18.0 backport of unflagged type stripping (the v24 docs history does not list it) or the exact npm version bundled with Node 24.21.0.
- I did not fetch the April 23, 2025 "Node.js Test CI Security Incident" post for details.
- I found no source assessing type stripping's own security (for example, parser bugs in the bundled stripping engine). The absence of CVEs is based only on the six advisories reviewed.
