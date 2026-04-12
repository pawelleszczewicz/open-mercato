# Coordinator Status

Updated: 2026-04-11T22:02:34Z

- Runtime reset completed after backing up the damaged state to:
  - `.state.backup-20260411T181232Z`
  - `.workspace/artifacts.backup-20260411T181232Z`
- `hackonctl.config.json` had been overwritten by an old schema at `2026-04-11T20:36Z`; restored current schema plus live coordinator overrides.
- Detached scheduler is running every 2 minutes:
  - PID/PGID: `263923`
  - command: `while true; do node packages/hackonctl/dist/bin.js drive green --once --target-active 10 --limit 10 --concurrency 10 --discover-limit 24; sleep 120; done`

Queue snapshot:
- `#1230 (HCK-0022)`: `judge_pending`
- `#1238 (HCK-0024)`: `judge_pending`
- `#1227 (HCK-0035)`: `judge_pending`
- `#1228 (HCK-0036)`: `judge_pending`
- `#1258 (HCK-0048)`: `changes_requested`
- `#1259 (HCK-0050)`: `judge_pending`
- `#1284 (HCK-0077)`: `judge_pending`
- `#1290 (HCK-0071)`: `judge_pending`
- `#1289 (HCK-0078)`: `judge_pending`
- `#1280 (HCK-0059)`: `review_in_progress`
- `#1278 (HCK-0048)`: `review_in_progress`
- `#1288 (HCK-0064)`: `implementing`
- `HCK-0085`: `implementing`
- `qualified`: `16`
- `HCK-0006`: `human_required`
