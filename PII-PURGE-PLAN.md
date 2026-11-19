# PII purge runbook (Round 9)

Self-contained plan for a fresh session. Goal: no real names, addresses, coordinates or sheet row ids anywhere in this repo, in any commit (content or message) reachable from any ref, or on GitHub, and only `main` remains. Written 2026-11-18 at v0.24.7 (HEAD `ceed18a`).

**Rules for whoever runs this**
- Never write a PII value into a file, commit message, issue, chat summary or this runbook. Refer to items by file, section or commit. The regexes below are written so they do not contain the values.
- Scripts and scratch files go in the session scratchpad, never the repo.
- Steps marked **STOP** need the owner's explicit OK in this session (they delete things or are hard to undo). Earlier approval does not carry over.
- Shell is Git Bash on Windows. Avoid backticks and `$(` inside commit messages and `sed` strings; put multi-line edits in a Python script file (inline heredocs have failed repeatedly here).
- Repo: `https://github.com/furqankhan123/jowla-map-optimize` (public, Pages from `main`, CI in `.github/workflows/ci.yml`). Python 3.11 and pip are installed; `git-filter-repo` is not.

## STATUS (2026-11-18)
Decisions made: D1 re-create repo, D2 yes (noreply address; also strip Claude trailers/authorship), D3 delete tags, D4 separate item. Done: steps 2-5 and 9 in the sibling folder jowla-clean (backup mirror in the sibling folder jowla-backup.git; old SHA lists in the session scratchpad). Scan after rewrite: PII categories 0, places.md unreachable, tests pass. NEXT (needs owner): step 6A (owner deletes and re-creates the repo; then push from jowla-clean), step 7 (swap folders, delete .playwright-mcp), step 8 verify, step 10 (delete this file).

## 0. Decisions to collect from the owner first (ask in one AskUserQuestion)

| # | Question | Recommended | Other option |
|---|----------|-------------|--------------|
| D1 | How to get the old commits off GitHub | Delete and re-create the repo with the same name (0 forks, 0 PRs, so nothing is lost but settings) | Keep the repo, force-push, then file a GitHub Support "remove sensitive data" request |
| D2 | Replace the personal author email on 105 commits with the GitHub noreply address | Yes | Leave as is |
| D3 | Tags `v0.5.0`, `v0.6.0` | Delete | Keep cleaned copies |
| D4 | Sheet exposure (see "Residual risk") | Track as a separate item after the purge | Handle now |

## 1. What is known (audit of 2026-11-18, don't re-derive, but re-scan in step 3)

- **PII in history (all in old versions of PLAN.md; HEAD is already clean since `ceed18a`):**
  - Sheet row ids written as `DFW rowid <number>`: 9 occurrences, 2 distinct ids (quick-log verification notes in the handoff).
  - A household first name used as the example in Round 7 item 7.2: `"Go: 1. <Name>"`, 3 occurrences.
  - A real organisation name from the sheet in handoff item 4 (Title Case acronyms): `("<three words> Usa")`, 2 occurrences.
- **`places.md`:** a Playwright snapshot with real data, committed by mistake and removed by an earlier rewrite. Gone from all branches, but its two commits are still in the local reflog (`git log --all --reflog --format=%H -- places.md`) and **GitHub still serves both at their commit URLs (HTTP 200 on 2026-11-18)**.
- **Refs:** `main`; local + remote `claude/marker-clustering`; remote `claude/implement-plan-md-qjez3u`. Both branches are 0 commits ahead of `main` (fully merged). Tags `v0.5.0`, `v0.6.0` (merged). No stashes, no PRs, 0 forks.
- **Author identity:** 105 commits use the owner's personal email (`git log --all --format=%ae | sort | uniq -c`).
- **Local only (not in git):** `.playwright-mcp/` (~260 snapshot/screenshot files with real names), the scratchpad, Claude transcripts under `~/.claude/projects/` (contain tool output with real names).
- Scans that found nothing else: address / TX ZIP / 5-decimal Texas coordinate / phone / email patterns over every diff line and commit message, and ~590 name tokens taken from the local snapshots.

## 2. Freeze and back up

1. Ask the owner to stop other sessions/clones from pushing until step 9.
2. Record what must 404 later (do this in the current working copy, before anything is deleted):
   ```bash
   S=<scratchpad>
   git -C /c/Users/Furqan/jowla-map-optimize log --all --reflog --format=%H -- places.md > $S/old-places-shas.txt
   git -C /c/Users/Furqan/jowla-map-optimize rev-list --all > $S/old-all-shas.txt
   ```
3. Mirror backup to a private folder outside the repo and outside the scratchpad (a reboot can clear it), e.g. `/c/Users/Furqan/jowla-backup.git`:
   `git clone --mirror https://github.com/furqankhan123/jowla-map-optimize /c/Users/Furqan/jowla-backup.git`

## 3. Re-scan (confirms nothing new since 2026-11-18)

Save as `$S/pii_scan.py` and run `python -I $S/pii_scan.py <repo> <snapshot-dir>`. It prints only counts and commit ids, never the matched text.

```python
import re, subprocess, sys, os, glob
repo, snaps = sys.argv[1], sys.argv[2]
log = subprocess.run(['git', '-C', repo, 'log', '--all', '--format=@@C %h%n%s%n%b', '-p'],
                     capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
pats = {
  'street_addr': r'(?i)\b\d{3,5}\s+[a-z]+(?:\s[a-z]+)*\s(?:dr|drive|st|street|ln|lane|ct|court|way|rd|road|blvd|ave|pkwy|trl|trail|cir)\b',
  'tx_zip': r'\bTX,?\s*7[5-9]\d{3}\b',
  'coords': r'\b3[0-4]\.\d{5,}\s*,\s*-9[5-8]\.\d{5,}',
  'phone': r'\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b',
  'rowid': r'\browid \d+',
  'go_name': r'Go: 1\. [A-Z][a-z]+(?=")',
  'org_usa': r'\("[^"\n]{3,60} Usa"\)',
}
toks = set()
for f in glob.glob(os.path.join(snaps, '*.yml')) + glob.glob(os.path.join(snaps, '*.md')):
    t = open(f, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'button "([A-Z][A-Z &\'.-]{4,60})"', t):
        toks |= {w.lower() for w in re.split(r'[ &]+', m.group(1)) if len(w) >= 4 and w.isalpha()}
stop = set('route stops show hide other pins optimize nearby close settings filters apply reset with from start visit details navigate google maps apple drive walk next done refresh data name city status none more than days clear save place places home office cluster suggest last mode stop choice fewer turns nearest visits hour preferred segment open full this that your location center main zoom keyboard shortcuts move left right down camera controls report error terms toggle view tilt rotate properties improvement'.split())
toks -= stop
if toks: pats['snapshot_name'] = r'(?i)\b(' + '|'.join(map(re.escape, sorted(toks))) + r')\b'
cur, hits = None, {}
for line in log.splitlines():
    if line.startswith('@@C '): cur = line[4:]; continue
    if line.startswith(('+++', '---', 'diff ', 'index ')): continue
    for k, p in pats.items():
        if re.search(p, line): hits.setdefault(k, set()).add(cur)
for k in pats: print(k, len(hits.get(k, ())), sorted(hits.get(k, ()))[:6])
print('places.md commits reachable:', subprocess.run(['git', '-C', repo, 'log', '--all', '--format=%h', '--', 'places.md'], capture_output=True, text=True).stdout.split())
```

Expected before the rewrite: `rowid`, `go_name`, `org_usa` > 0; `street_addr` 1 (a fake example address, "123 Main St"-style, fine); `snapshot_name` hits only on words that are also ordinary words or city names (check each by eye: e.g. a city like Murphy is not PII). Anything else: inspect with `git log --all -p -S'<term>'` in the terminal only, then add a value-free regex for it to step 4.

## 4. Rewrite history (on a fresh clone)

1. `python -m pip install git-filter-repo`
2. `git clone https://github.com/furqankhan123/jowla-map-optimize /c/Users/Furqan/jowla-clean && cd /c/Users/Furqan/jowla-clean`
3. Replacement file `$S/replacements.txt` (works for both file contents and commit messages):
   ```
   regex:DFW rowid \d+==>a test row
   regex:Go: 1\. [A-Z][a-z]+(?=")==>Go: 1. <name>
   regex:\("[^"\n]{3,60} Usa"\)==>(seen on an organisation name ending in "USA")
   ```
   Add a line for anything new found in step 3.
4. If D2 = yes, `$S/mailmap.txt` with one line: `Furqan <NOREPLY> <PERSONAL>`, where PERSONAL is the email shown by `git log --format=%ae | sort -u` (the non-anthropic one) and NOREPLY is the owner's GitHub noreply address (GitHub > Settings > Emails; ask the owner). Never commit this file.
5. Run:
   ```bash
   python -m git_filter_repo --replace-text $S/replacements.txt --replace-message $S/replacements.txt \
     --invert-paths --path places.md [--mailmap $S/mailmap.txt]
   ```
   (If `python -m git_filter_repo` is not found, use `git filter-repo` with the same arguments.)
6. filter-repo removes `origin`; re-add it: `git remote add origin https://github.com/furqankhan123/jowla-map-optimize`
7. Check: `python -I $S/pii_scan.py /c/Users/Furqan/jowla-clean <snapshot-dir>` shows 0 for `rowid`, `go_name`, `org_usa`, and `places.md commits reachable: []`. `node tests/run.js` passes. `git diff <old HEAD tree> HEAD --stat` from the old clone differs only in PLAN.md lines (compare `git ls-tree -r HEAD` hashes for the JS/CSS/HTML files: identical).

## 5. Branches and tags (in the clean clone)

- filter-repo keeps only refs that exist in the clone: delete any local branch other than `main` (`git branch -D claude/marker-clustering` if present).
- If D3 = delete: `git tag -d v0.5.0 v0.6.0`.

## 6. Publish (**STOP**: confirm with the owner first, separately for 6A deleting the repo)

**6A (D1 = re-create, recommended)**
1. Before deleting, note the repo settings: description, Pages source (Settings > Pages: Deploy from branch `main`, `/ (root)`), Actions secrets/variables (check `ci.yml` for `secrets.`), any custom domain.
2. The owner deletes the repo on github.com (Settings > General > Delete this repository). The assistant cannot and must not do this.
3. The owner creates a new public repo with the same name, empty (no README, license or .gitignore).
4. `git push -u origin main` (plus `git push origin --tags` if D3 = keep).
5. Re-enable Pages (branch `main`, root); re-add any secrets; check that the CI workflow runs green.

**6B (D1 = keep the repo)**
1. `git push --force origin main`
2. `git push origin --delete claude/marker-clustering claude/implement-plan-md-qjez3u`
3. Tags: `git push --force origin --tags` (keep) or `git push origin --delete v0.5.0 v0.6.0` (delete).
4. The owner files a GitHub Support request (support.github.com > "Remove sensitive data / cached views"), listing: the repo, the SHAs in `$S/old-places-shas.txt`, and that all pre-rewrite commits should be purged and GC'd. Until GitHub confirms, old SHAs stay viewable.

## 7. Local cleanup (**STOP**: confirm before deleting folders)

1. Replace the old working copy: move `/c/Users/Furqan/jowla-map-optimize` aside, then move `/c/Users/Furqan/jowla-clean` into its place (keeps the VS Code workspace path). The old `.git` holds the reflog with the old commits, so delete it once step 8 passes. Do not `git pull` into the old copy.
2. In the new copy: `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
3. Delete `.playwright-mcp/` contents (snapshots with real names) and the scratch files from this runbook (`old-*.txt` keep until step 8 is done).
4. Every other clone (other PCs, cloud sessions, phone editors) must be deleted and re-cloned. A pull or push from an old clone brings the old commits back.
5. Optional (owner): delete old Claude transcripts for this project under `~/.claude/projects/` that contain real names from tool output.
6. After step 8: delete the mirror backup `/c/Users/Furqan/jowla-backup.git` (it contains the PII).

## 8. Verify

- `python -I $S/pii_scan.py <repo> <snapshot-dir>`: 0 for every PII category (fake example address and ordinary-word name tokens excepted, as in step 3).
- `git log --all --reflog -- places.md` prints nothing; `git branch -a` shows only `main` (and `origin/main`); `git tag` matches D3.
- GitHub: for every SHA in `old-places-shas.txt` and ~10 random SHAs from `old-all-shas.txt`,
  `curl -s -o /dev/null -w '%{http_code}' https://github.com/furqankhan123/jowla-map-optimize/commit/<sha>` returns 404 (6A right away; 6B only after Support confirms).
- Pages: `curl -s https://furqankhan123.github.io/jowla-map-optimize/sw.js | grep CACHE_VERSION` shows the current version, and the live site loads in Playwright (unregister the SW first, see the PLAN testing tips).
- `node tests/run.js` passes locally and in CI.

## 9. Prevent it happening again

1. Add `tests/pii.test.js` (picked up automatically by `tests/run.js`): list tracked files with `git ls-files` (skip `vendor/`, `icons/`), and fail with file + line number (never the text) on: TX ZIP (`\bTX,?\s*7[5-9]\d{3}\b`), street address (case-insensitive pattern from step 3, allowlist the fake example), Texas coordinates with 5+ decimals, `rowid \d+`, and any `.md`/`.yml` file whose name or content looks like a Playwright snapshot (`- button "` lines). Run it once and tune any false positives.
2. Keep the privacy rules in the PLAN handoff (already there); add "run `node tests/run.js` before every push" (already the release rule).
3. Release with `node tools/bump-version.js` as usual (patch bump, changelog "PII guard in tests").

## 10. Finish

- In PLAN.md mark Round 9 DONE with the date and the option used (6A/6B), remove open item 0, and add a verified fact: "history rewritten on <date>; all SHAs before it are gone; re-clone, never pull, from older clones".
- Delete this runbook in the same commit (its content is not PII, it is just finished).

## Residual risk outside git (D4)

`config.js` must ship the Sheets id and API key to the browser, so they stay public on Pages whatever the history says. An HTTP-referrer restriction only stops browsers: a script can send any `Referer`, so if the sheet is readable with that key, anyone who has seen the repo can read all ~39,700 rows of names and addresses. Fixing it means restricting the sheet's sharing and serving rows through the Apps Script relay (`apps-script/Code.gs`) with a token. This is an owner decision and a separate piece of work; do not test it by sending spoofed requests.

## Rollback

Until step 7.6, the mirror backup restores everything: `git clone /c/Users/Furqan/jowla-backup.git` (and for 6A, push it to a new repo). After the backup is deleted there is no way back, by design.
