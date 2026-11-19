# CLAUDE.md

Jowla Map: a static, no-build PWA (plain JS, no bundler, no runtime deps) served from `main` on GitHub Pages. `PLAN.md` holds the roadmap, decisions and the session handoff (read its "Session handoff" section first). `CHANGELOG.md` is the release log.

## Development lifecycle

1. **Orient.** Read the PLAN.md handoff and the relevant plan item/round. Work directly on `main`.
2. **Plan.** Pick the next item from the PLAN.md tables (order rule: visit-data bugs first, then the route card, then polish). Keep each change small enough to ship as one patch version.
3. **Implement.** Edit the plain source files (`map.js`, `optimize-route.js`, `logic.js`, `map.html`, `map.css`, etc.). Put pure logic in `logic.js` / `segments.js` so it can be unit tested in Node.
4. **Test.**
   - Add or update tests in `tests/*.test.js`, then run `node tests/run.js`. It syntax-checks every JS file and runs all tests, including the PII guard. CI runs the same command.
   - For UI changes, verify in a browser with the Playwright MCP native tools (`browser_click`, `browser_type`, `browser_select_option`, `browser_take_screenshot`) at 390x844, plus 1280x800 for desktop layout. Native tooling is preferred for all Playwright testing: drive the UI the way a user would. Use `browser_evaluate` / `browser_run_code_unsafe` only for read-only checks, geolocation stubs and offline toggling.
   - Playwright has no real GPS: stub `navigator.geolocation.getCurrentPosition` and zoom to ~15 before Optimize.
   - Things that need a real phone (GPS, Apple/Google Maps handoff, touch sizing) are listed in the PLAN handoff as pending owner checks.
5. **Release.** Every shipped change is a version bump:
   `node tools/bump-version.js X.Y.Z "changelog line" ["plan row to mark DONE"]`
   This rewrites `config.js` version, every `?v=` in the HTML files, `CACHE_VERSION` in `sw.js`, prepends the CHANGELOG entry and optionally marks the PLAN row DONE. Never edit those by hand. Use patch bumps for fixes and minor bumps for features.
6. **Commit and push.** One commit per change, message like `Short imperative summary (0.24.12)`. Run `node tests/run.js` first. Push to `main`. Plan-only updates use a `PLAN: ...` commit message.
7. **Verify the deploy.** Pages takes 1-2 minutes. Check with `curl <site>/sw.js | grep CACHE_VERSION`. The service worker serves old files after a deploy, so unregister it and clear caches (or reload twice) before re-testing live.
8. **Record.** Update PLAN.md: mark the item DONE with the version, note anything learned, and keep the Session handoff accurate (state, verified facts, open items, testing tips) so a fresh session can continue.

## Rules

- **Privacy:** never put real addresses, names, coordinates, phone numbers or sheet row ids in the repo, commit messages or PLAN. Use fake examples. Playwright snapshots and screenshots contain real data: `.playwright-mcp/` is gitignored, and any `filename` passed to `browser_snapshot` must be under that folder or the scratchpad, never the repo root.
- **No live writes:** never run quick-log or "Log visit" in tests without the owner's explicit say-so. It writes to the real sheet through the Visit Details form.
- **Cost:** keep Google Maps usage inside the free tier. Candidate selection is local math, and only the final Directions call costs anything.
- **Git:** no Claude attribution lines in commit messages or PR descriptions (see the global CLAUDE.md).
