# Kelcha — User Guide

A TradingView-style, multi-session **bar-replay backtester** for forex & indices, with
ICT tooling, paper trading, and one-click journaling to Obsidian or Notion.

Everything you set up (sessions, drawings, indicators, themes, timezone, killzone
config) is tied to your account and **follows your login across devices**.

---

## 1. Creating a session

A *session* is one replay workspace: a symbol, a date range, its own charts,
drawings, and trades.

1. On the **Home** dashboard, click **New Session** (or the **+** on the tab bar).
2. Pick the **asset class** (Forex / Index) and **symbol**.
3. Set the **date range** — the window you want to replay. You can start well
   before your range of interest; history *behind* the start still loads when you
   zoom out.
4. Click **Create**. The chart opens parked at the first real bar of your range.

**Tips**
- **Multiple sessions**: each tab is independent (own charts, drawings, trades).
  Right-click a tab to rename, duplicate, or close.
- **Zero sessions is fine** — deleting the last one returns you to Home.
- **Layouts**: use the 1 / 2 / 4 pane buttons in the top toolbar; each pane can be
  a different timeframe and chart type (candles / bars / hollow / area).
- Charts load **on demand** — the first paint is fast even on a fresh device;
  zooming out pulls older candles as needed.

### Replaying
- **Play / Pause**: the ▶ button or **Space**.
- **Step**: the ± buttons or **← / →** (one bar of the focused pane's timeframe;
  **Shift + arrow** = 10 bars).
- **Candle speed**: the dropdown = market-time formed per real second.
- **Jump**: click on the timeline scrubber, or **Ctrl/Cmd+Click** a chart, or
  right-click → *Move replay head here*.
- **Gaps are skipped**: weekends/holidays with no data are jumped automatically so
  playback never sits frozen on dead time.

---

## 2. Paper trading

The right-hand **Trading panel** is a live paper-trading blotter tied to the
replay head.

1. **Account** — starting balance/leverage shown at the top.
2. **Order ticket** — choose Market or a Pending (Limit/Stop), set size, and
   optional **Stop Loss** / **Take Profit**. Click a level field then click the
   chart to set it from a price.
3. **Open / Pending** — live positions and resting orders.
4. As you **play or step forward**, fills settle correctly against *every* 1-minute
   bar crossed — pending orders, SL and TP trigger at the right prices even when
   you step an hour or scrub across days.
5. **P&L + Blotter** — running P&L and a closed-trade history; trades appear as
   win/loss ticks on the timeline.
6. **Export** closed trades to CSV, or open **Journal** to write them up (below).

Trades are saved per session and follow your login.

---

## 3. Journaling & forecasting (Obsidian / Notion)

You can write **Forecasts** (pre-trade plans) and **Journals** (Backtest ASR
reviews) with screenshots, and push them to **Obsidian** *or* **Notion**.

### Choosing a target
Open **Settings → Journaling** and set the target to **Obsidian** or **Notion**.

### Connecting Obsidian (local vault)
Obsidian uses your browser's File System Access API to write directly into a
local vault folder.

1. Settings → Journaling → **Obsidian** → **Connect vault** and pick your vault
   folder. Grant read/write permission when prompted.
2. Set the **Backtest / Forecast / Templates** subfolder names (defaults are fine).
3. Notes are written as `.md` files; screenshots go into an `attachments/`
   subfolder next to them.

> The browser remembers the folder handle, but may re-prompt for permission after
> a restart — just re-grant it.

### Connecting Notion
1. In Notion, create an **internal integration**
   (notion.so → *My integrations* → *New integration*), copy its **secret token**.
2. **Share the target database/page with the integration** — in Notion open the
   database, click **•••  → Connections → Add connections → \<your integration\>**.
   *(This step is the one people miss — see Troubleshooting.)*
3. In the app: Settings → Journaling → **Notion** → paste the token → **Connect**.
   Use **Refresh** to list the databases/pages the integration can see.

### The Journal / Forecast dock
Click **Journal** or **Forecast** in the top toolbar — they open a **docked panel**
in the right rail (not a blocking window).

- Fill in the fields (bias, targets, grade, etc.).
- Add screenshots per timeframe: **Capture current chart** grabs the active pane
  (drawings included), or **Upload** a file. Add an optional note under each shot.
- Because the dock stays open, you can **change the chart's timeframe and capture
  again into the same note** — build a Daily → H1 → M15 set without reopening.
- **Backtest / For date** drives the note's filename (the date you're reviewing,
  not today).
- **Save** writes the note + images to Obsidian/Notion.
- **Reopen** an existing note (Obsidian) to view its saved screenshots and add more.

---

## 4. Changing the timezone

All chart times, the replay clock, and the scrubber default to **UTC**.

- In the **playback bar** (bottom), use the **TZ** dropdown to pick a display
  timezone (UTC + common IANA zones like America/New_York, Europe/London, Asia/Tokyo).
- This shifts the chart x-axis labels, the head clock, and the scrubber tooltip.
  It's a **display** shift only — the underlying data is unchanged.
- The preference follows your login.

> The **ICT Killzones** indicator keeps its *own* timezone (set in its settings) so
> sessions stay anchored to the market clock regardless of your display timezone.

---

## 5. ICT Killzones indicator

Session **killzone boxes** (Asia / London / NY AM / Lunch / PM) plus **high/low
pivot lines** that extend until mitigated.

1. Top toolbar → **Indicators** → toggle **ICT Killzones** on.
2. Click the **gear** next to it to open settings:
   - **Timezone** — the market zone the sessions are defined in (default
     America/New_York). Independent of your display timezone.
   - **Sessions kept** — how many recent instances of each killzone to draw.
   - **Toggles** — Boxes / Box text / Pivots / Pivot labels.
   - **Per-killzone rows** — enable/disable, rename, set the session window as
     `HHMM-HHMM` (24h; `0000` = midnight-end; start > end = overnight), and colour.
3. It redraws live as you edit, and is **replay-aware** — boxes/pivots recompute
   from the data up to the replay head.

Your killzone setup follows your login.

---

## 6. Drawing tools

Open the left **drawing toolbar**; tools are grouped (Lines, Channels, Fib, Shapes,
Annotations, Position, Measure). Highlights:

- **Lines**: trend, ray, extended, horizontal, vertical, cross, trend-angle, info
  line, **Path (2/3/4-leg)** (arrowed projections), **Curved line** (bézier).
- **Channels**: parallel channel, parallel lines, pitchfork.
- **Fib**: retracement (editable levels) + trend-based extension.
- **Shapes / Annotations / Position / Measure**: rectangle, circle, triangle,
  arrows, text, callout, price label, long/short position, measure, date/price
  ranges.

Select a drawing to get the **floating toolbar** (colour, width, style, lock, hide,
settings, delete). Double-click for the full **settings dialog** (style,
coordinates, per-timeframe visibility, named templates). Drawings persist and
follow your login.

> **Path leg count is fixed** (2/3/4) because the chart engine (klinecharts v9)
> requires a fixed number of points per tool — variable-length "click-then-double-
> click" drawing needs klinecharts v10, which we can't adopt yet without
> re-architecting the replay feed.

---

## Troubleshooting

### Notion: "connected but no databases / pages", or images/notes don't upload
Notion **internal integrations only see content you explicitly share with them.**
A valid token is not enough.

1. In Notion, open the database (or its parent page).
2. **•••  → Connections → Add connections → \<your integration\>**.
3. Back in the app, Settings → Journaling → Notion → **Refresh**.

If notes save as text but **images fail**: images are uploaded via Notion's File
Upload API and must be ≤ 20 MB each and a supported type (PNG/JPG/WEBP/GIF). Very
large full-resolution captures can fail — recapture, or the app compresses drafts
automatically.

### Obsidian: "No vault connected" or a write fails
- The browser's **File System Access** permission can lapse after a restart —
  Settings → Journaling → Obsidian → **Connect vault** again (or re-grant when
  prompted).
- Reopening a saved note's screenshots reads them back from the vault's
  `attachments/` folder, so it only works while the vault is connected.
- File System Access needs a **Chromium browser** (Chrome/Edge) over **HTTPS**.

### Charts: `ERR_NAME_NOT_RESOLVED`, "no candles", or a very slow first load
This is a **client-side DNS/network** failure (the request never leaves your
machine) — not the app. The manifest fetch fails, so nothing can render.
- **Hard-reload** (`Ctrl+Shift+R`), then `ipconfig /flushdns` (Windows).
- Try **incognito** (rules out an ad-blocker/privacy extension returning NXDOMAIN),
  a **different browser**, or a **phone hotspot** (rules out your router/ISP DNS).
- Open the app URL directly in a new tab; if that also fails, it's DNS on your side.

### "Candles don't form when I press play"
Usually the session **starts on a market holiday/weekend** so the head sits in a
data gap. The app now snaps the head to the first real bar and skips gaps during
playback — **hard-reload** to pick up the latest build, then recreate the session.

### A change I made isn't showing
The app is a single-page app — **creating a new session or clicking a button does
not reload code**. After a deploy, **hard-reload the whole tab** (`Ctrl+Shift+R`)
to get the new build.

### ICT Killzone label overlapping the pair readout
Fixed — the indicator's name legend no longer renders over the OHLC legend. If you
still see it, hard-reload.
