import instruments from '../../data-pipeline/instruments.json';

export type AssetClass = 'forex' | 'index' | 'commodity';

export interface SymbolInfo {
  /** Internal id (lowercase), e.g. 'eurusd' or 'us30'. */
  symbol: string;
  /** Display label, e.g. 'EUR/USD'. */
  label: string;
  /** dukascopy instrument code used by the pipeline (may differ from `symbol`). */
  instrumentCode: string;
  /** Decimal places for the price axis. */
  pricePrecision: number;
  assetClass: AssetClass;
  /** Whether data has been packaged and is seedable (offered in the add-tab menu). */
  available: boolean;
  /** Units per 1.0 lot/contract — drives account-currency P&L. Forex = 100k; index = 1. */
  contractSize: number;
}

/**
 * The instruments the app knows about — loaded from
 * `data-pipeline/instruments.json`, the SINGLE source of truth shared with the
 * refresh Job and the packager (which stamps each entry into its symbol's
 * manifest.json so the engine prices trades with the same specs). To add a
 * symbol, add one entry THERE — never re-declare specs in code.
 */
export const SYMBOLS: Record<string, SymbolInfo> = Object.fromEntries(
  instruments.map((s) => [s.symbol, { ...s, assetClass: s.assetClass as AssetClass }])
);

export const SYMBOL_LIST: SymbolInfo[] = Object.values(SYMBOLS);
export const AVAILABLE_SYMBOLS: SymbolInfo[] = SYMBOL_LIST.filter((s) => s.available);

export function getSymbolInfo(symbol: string): SymbolInfo {
  return (
    SYMBOLS[symbol] ?? {
      symbol,
      label: symbol.toUpperCase(),
      instrumentCode: symbol,
      pricePrecision: 5,
      assetClass: 'forex',
      available: true,
      contractSize: 100000
    }
  );
}
