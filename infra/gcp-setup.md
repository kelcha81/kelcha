# GCP setup — Phase 0 (deploy web + engine to Cloud Run)

One-time provisioning. Your `gcloud` session is already authenticated and on the
correct project. Commands below are **PowerShell** (Windows). They use `` ` ``
for line continuation and `$VAR` variables that persist within one shell session.

> Outcome: pushing to `main` builds both images and deploys them to Cloud Run.
> The **web** service is public; the **engine** is also IAM-public (the browser
> calls it directly) — real per-user security arrives in Phase 1 as Firebase
> ID-token verification *inside* the engine, not via Cloud Run IAM.

## Windows prerequisite — point gcloud at a real Python

The Google Cloud CLI is a Python program. If it was installed **without bundled
Python** and `CLOUDSDK_PYTHON` is unset, gcloud tries to run `python3`, which on
Windows often resolves to the 0-byte Microsoft Store alias and fails with:

```
Python was not found; run without arguments to install from the Microsoft Store...
```

Fix once (uses the system Python at `C:\Python314`; adjust if yours differs):

```powershell
setx CLOUDSDK_PYTHON "C:\Python314\python.exe"   # persists to NEW shells
$env:CLOUDSDK_PYTHON = "C:\Python314\python.exe"  # also fix the CURRENT shell
gcloud version                                    # should print SDK info now
```

Optional hygiene: **Settings → Apps → Advanced app settings → App execution
aliases** → turn **off** `python.exe` and `python3.exe` so the Store stubs stop
shadowing real interpreters. (Re-running the official Cloud CLI installer with
"Install bundled Python" checked is the permanent alternative.)

## 0. Variables

```powershell
$PROJECT_ID      = gcloud config get-value project
$PROJECT_NUMBER  = gcloud projects describe $PROJECT_ID --format='value(projectNumber)'
$REGION          = "europe-west2"             # London; pick your closest region
$AR_REPO         = "containers"
$CANDLES_BUCKET  = "$PROJECT_ID-candles"
$ATTACH_BUCKET   = "$PROJECT_ID-attachments"
$GITHUB_REPO     = "kelcha81/<REPO_NAME>"     # <-- set the real repo path
```

## 1. Enable APIs

```powershell
gcloud services enable `
  run.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  firestore.googleapis.com `
  firebase.googleapis.com `
  identitytoolkit.googleapis.com `
  secretmanager.googleapis.com `
  cloudscheduler.googleapis.com `
  iamcredentials.googleapis.com `
  sts.googleapis.com
```

## 2. Artifact Registry (Docker images)

```powershell
gcloud artifacts repositories create $AR_REPO `
  --repository-format=docker --location=$REGION `
  --description="Cloud Run images"
```

## 3. Storage buckets

```powershell
gcloud storage buckets create "gs://$CANDLES_BUCKET" --location=$REGION --uniform-bucket-level-access
gcloud storage buckets create "gs://$ATTACH_BUCKET" --location=$REGION --uniform-bucket-level-access
```

Candle data is normally populated **on demand** by the app's live Dukascopy
pull (Data Manager → `/api/symbols/package`). The bucket can start empty. If you
want to pre-seed it from a local checkout instead, the engine reads it from the
gcsfuse mount at `/mnt/candles` (`ICT_DATA_DIR`); layout mirrors `web/public/data/`:

```powershell
# optional: from web/ after running the data pipeline locally
gcloud storage rsync -r ./public/data "gs://$CANDLES_BUCKET"
```

## 4. Secret Manager — the global Anthropic key

Pipe-from-string adds a trailing newline in PowerShell, which corrupts the key —
use a temp file written with `-NoNewline`:

```powershell
$key = "sk-ant-...your-key..."
Set-Content -Path "$env:TEMP\anthropic.key" -Value $key -NoNewline -Encoding ascii
gcloud secrets create anthropic-api-key --data-file="$env:TEMP\anthropic.key" --replication-policy=automatic
Remove-Item "$env:TEMP\anthropic.key"
# rotate later: Set-Content ... ; gcloud secrets versions add anthropic-api-key --data-file=... ; Remove-Item ...
```

## 5. Firestore (used in Phase 1, create it now)

```powershell
gcloud firestore databases create --location=$REGION --type=firestore-native
# Add Firebase (enables Firebase Auth). Needs firebase-tools, or do it in the console:
#   npm install -g firebase-tools ; firebase login ; firebase projects:addfirebase $PROJECT_ID
```

## 6. Service accounts

Two roles: a **deployer** (assumed by GitHub Actions via WIF) and a **runtime**
SA the Cloud Run services run as.

```powershell
# Deployer — builds/pushes/deploys
gcloud iam service-accounts create gha-deployer --display-name="GitHub Actions deployer"
$DEPLOY_SA = "gha-deployer@$PROJECT_ID.iam.gserviceaccount.com"

# Runtime — what the services execute as
gcloud iam service-accounts create cloudrun-runtime --display-name="Cloud Run runtime"
$RUNTIME_SA = "cloudrun-runtime@$PROJECT_ID.iam.gserviceaccount.com"

# Deployer permissions
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$DEPLOY_SA" --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$DEPLOY_SA" --role="roles/artifactregistry.writer"
# Let the deployer set services to run AS the runtime SA
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA `
  --member="serviceAccount:$DEPLOY_SA" --role="roles/iam.serviceAccountUser"

# Runtime permissions: read the secret + candle bucket (gcsfuse), write attachments
gcloud secrets add-iam-policy-binding anthropic-api-key `
  --member="serviceAccount:$RUNTIME_SA" --role="roles/secretmanager.secretAccessor"
gcloud storage buckets add-iam-policy-binding "gs://$CANDLES_BUCKET" `
  --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectViewer"
gcloud storage buckets add-iam-policy-binding "gs://$ATTACH_BUCKET" `
  --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectAdmin"
```

## 7. Workload Identity Federation (keyless GitHub auth)

```powershell
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc github `
  --location=global --workload-identity-pool=github --display-name="GitHub OIDC" `
  --issuer-uri="https://token.actions.githubusercontent.com" `
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" `
  --attribute-condition="assertion.repository_owner=='kelcha81'"

# Allow only this repo to impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA `
  --role="roles/iam.workloadIdentityUser" `
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO"

# The value to paste into the GCP_WIF_PROVIDER repo variable:
"projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

## 8. GitHub repository Variables

`gh` CLI isn't installed, so set these in the browser: repo → Settings → Secrets
and variables → Actions → **Variables** (not secrets — none are sensitive).
Print the values to copy:

```powershell
Write-Host "GCP_PROJECT_ID     = $PROJECT_ID"
Write-Host "GCP_REGION         = $REGION"
Write-Host "GCP_AR_REPO        = $AR_REPO"
Write-Host "GCP_CANDLES_BUCKET = $CANDLES_BUCKET"
Write-Host "GCP_WIF_PROVIDER   = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
Write-Host "GCP_DEPLOY_SA      = $DEPLOY_SA"
Write-Host "GCP_RUNTIME_SA     = $RUNTIME_SA"
```

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | project id |
| `GCP_REGION` | e.g. `europe-west2` |
| `GCP_AR_REPO` | `containers` |
| `GCP_CANDLES_BUCKET` | `<project>-candles` |
| `GCP_WIF_PROVIDER` | the `projects/.../providers/github` string from step 7 |
| `GCP_DEPLOY_SA` | `gha-deployer@<project>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `cloudrun-runtime@<project>.iam.gserviceaccount.com` |

## 9. First deploy

Push to `main` (or run the **deploy** workflow manually). The engine deploys
first; the web build inlines the engine URL via `NEXT_PUBLIC_ENGINE_URL`.

Verify:

```powershell
gcloud run services describe web    --region=$REGION --format='value(status.url)'
$ENGINE_URL = gcloud run services describe engine --region=$REGION --format='value(status.url)'
Invoke-RestMethod "$ENGINE_URL/strategies"
```

Open the web URL, run a backtest — it should hit the engine and return results.

## Notes / follow-ups
- **Least privilege:** one shared runtime SA is used for simplicity. Split into
  per-service SAs (engine needs the secret + candles; web needs neither) when hardening.
- **Candle data plane:** the engine mounts the bucket read-only at `/mnt/candles`.
  The pipeline (`web/data-pipeline`) is folded into the web container; the
  follow-up is to have the web `/api/symbols/package` route write packaged JSON
  straight to the candles bucket so live pulls populate it with no rsync/job.
- **bash variant:** if you ever run setup from Git Bash/WSL, swap `$VAR =` for
  `export VAR=`, backticks for `\`, and the secret temp-file for
  `printf '%s' '...' | gcloud secrets create ... --data-file=-`.
