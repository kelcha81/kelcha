# kelcha — forex backtester + journal

A multi-tenant web product for ICT-style forex/indices backtesting with direct
trade journalling. Deployed on GCP Cloud Run.

## Layout

```
web/                Next.js app (UI + API routes); pulls candles live from Dukascopy
  data-pipeline/    Dukascopy download + aggregation scripts (run server-side)
engine/             Python backtest engine + ICT detectors + ICT Training (AI authoring)
infra/              GCP provisioning guide (infra/gcp-setup.md)
.github/workflows/  CI (PR build/test) + deploy (push-to-main → Cloud Run)
dev.ps1             Run engine (:8000) + web (:3000) together (Windows/PowerShell)
```

`web` and `engine` deploy as two independent Cloud Run services (different
languages, independent scaling). The data pipeline is folded into `web` so the
live Dukascopy pull works inside the web container.

## Local dev (Windows / PowerShell)

```powershell
# one-time
cd web ; npm install ; cd ..

# run both services
.\dev.ps1
```

Open <http://localhost:3000>. Use the Data Manager to pull a symbol from
Dukascopy (live download → aggregate → package → seeds IndexedDB), then backtest.

The engine needs Python 3 (stdlib only for backtests; `anthropic`/`optuna`/
`numpy`/`scikit-learn` enable ICT Training — installed in the engine container).

## Deploy

Push to `main` → GitHub Actions builds both images, pushes to Artifact Registry,
and deploys to Cloud Run via Workload Identity Federation. One-time GCP setup and
the required GitHub Environment (`backtest`) variables are documented in
[`infra/gcp-setup.md`](infra/gcp-setup.md).
