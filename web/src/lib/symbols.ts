export type AssetClass = 'forex' | 'index';

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
 * The instruments the app knows about. The registry is the single source of
 * truth for precision/labels/codes + contract specs (used by the P&L model).
 */
export const SYMBOLS: Record<string, SymbolInfo> = {
  eurusd: { symbol: 'eurusd', label: 'EUR/USD', instrumentCode: 'eurusd', pricePrecision: 5, assetClass: 'forex', available: true, contractSize: 100000 },
  gbpjpy: { symbol: 'gbpjpy', label: 'GBP/JPY', instrumentCode: 'gbpjpy', pricePrecision: 3, assetClass: 'forex', available: true, contractSize: 100000 },

  us30: { symbol: 'us30', label: 'US30 (Dow)', instrumentCode: 'usa30idxusd', pricePrecision: 1, assetClass: 'index', available: true, contractSize: 1 },
  nas100: { symbol: 'nas100', label: 'NAS100', instrumentCode: 'usatechidxusd', pricePrecision: 1, assetClass: 'index', available: true, contractSize: 1 },
  us500: { symbol: 'us500', label: 'S&P 500', instrumentCode: 'usa500idxusd', pricePrecision: 1, assetClass: 'index', available: true, contractSize: 1 },
  ger40: { symbol: 'ger40', label: 'GER40 (DAX)', instrumentCode: 'deuidxeur', pricePrecision: 1, assetClass: 'index', available: true, contractSize: 1 }
};

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
