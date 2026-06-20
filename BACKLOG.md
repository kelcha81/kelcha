# Backlog — improvements & deferred work

Deferred items, captured so they aren't lost. Not scheduled; pull into a phase when ready.

## Obsidian integration

- **D2 — MCP bridge (deferred).** Expose backtest journaling/results over MCP so the
  Obsidian `obsidian-ai-agents` agent can pull and journal backtests conversationally
  ("journal my last EURUSD backtest", "what was my best avgR run this week?").
  Requires two builds: (a) an MCP server, cleanest as a thin layer over the ICT engine
  (`:8000`) exposing tools like `list_backtests` / `get_backtest_result` /
  `create_backtest_asr`; (b) an **MCP client inside the plugin** (it has none today —
  only outbound provider `fetch`, no inbound server) over a local HTTP/SSE transport.
  Decision pending: engine-as-server vs standalone Node MCP server vs app-as-client.

- **Chart screenshots in ASR notes — DONE (D3).** Journal modal captures the active
  KLineChart pane (overlays/drawings incl.) or accepts an upload, into Pre-entry/Post-entry
  timeframe slots; images write to `<backtestFolder>/attachments` and embed under the
  matching headings. (`chartShot.ts`, `asr.embedCaptures`, capture UI in `JournalModal`.)

- **D4 — Pre-trade Forecast (plan) notes — DONE.** Chose the Forecast + ASR split (the
  user's forward-test workflow). A toolbar **Forecast** button creates a Daily/Weekly
  Forecast note (bias, liquidity targets, draw, invalidation) with per-timeframe
  screenshots (Daily/4hr/1hr/15m), template-synced from the user's Forecast template;
  the plugin auto-links a same-date/same-pair ASR. (`forecast.ts`, `ForecastModal`,
  generalized `/api/obsidian` GET `file` + POST `folder`, `obsidianStore.forecastFolder`.)

- **md → form round-trip — DONE (Forecast + ASR).** Both modals can reopen an existing note
  (picker over the folder), parse its frontmatter back into the form, and update it in place —
  body + date/identity (and trade-derived fields, for ASRs) preserved, edited fields + new
  screenshots merged. JournalModal `trade` is now optional, and a toolbar **Journal** button
  opens it standalone for editing past ASRs. (`parseFrontmatter`/`parseYamlList`/`setFrontmatter`,
  `updateForecast`/`updateBacktestAsr`, `/api/obsidian` GET `list`/`note`.)

- **D4 follow-ups (later).** Forward-testing mode (live/paper feed driving Forecast→ASR);
  explicit forecast↔ASR link affordance in the app rather than relying on the plugin's
  autolink.

- **Read existing ASR back into the journal form.** `parseFrontmatterKeys` already reads
  template keys; extend to parse a full ASR note's frontmatter values so an existing note
  can be re-opened/edited from the app (md → journal fields round-trip).

- **Bulk journal a run.** "Journal all trades" for a backtest run (one ASR per trade),
  with a guard against duplicates (the plugin numbers same-day/pair ASRs).

## Other

- **Backtest results persistence across full reload — DONE.** Results now persist to
  IndexedDB (new `backtests` store, keyed by the persisted tabId) and rehydrate on load
  via `useBacktestStore.hydrate()` (called from Dashboard). IDB handles the large
  annotation sets localStorage couldn't. (`idb.ts` get/put/deleteBacktest + getAllBacktests.)

- **Forward-testing mode (in progress).** Goal: forward-walk a market with the
  Forecast → trade → ASR discipline (vs historical backtesting). Slice 1 (this work):
  **Live ASR journaling** — journal manual/forward trades as a Daily ASR (`Trade Type: Live`)
  into the live ASR folder, distinct from Backtest ASRs. Later slices (need direction):
  a live/near-live data feed, a tracked forward-test session, and Live-vs-Backtest split in
  the results UI.
