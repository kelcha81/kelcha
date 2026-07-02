# Cloud Run Job: daily candle refresh. Re-pulls each symbol from Dukascopy up to
# yesterday and re-packages into the candles bucket, which is mounted at
# /app/public/data (package-data writes to ../public/data). The dukascopy tick
# cache persists under that bucket (DUKASCOPY_CACHE_DIR) so runs are incremental.
#   docker build -t data-refresh .   (context = web/data-pipeline)
FROM node:22-alpine
WORKDIR /app/data-pipeline
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
CMD ["node", "refresh.js"]
