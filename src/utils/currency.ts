/**
 * Global Multi-Currency Support Module
 * Handles symbols, formatting, decimal precision, and metadata for 27 global currencies.
 */

export type SupportedCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'INR'
  | 'AED'
  | 'SAR'
  | 'QAR'
  | 'KWD'
  | 'OMR'
  | 'BHD'
  | 'JPY'
  | 'CNY'
  | 'HKD'
  | 'SGD'
  | 'AUD'
  | 'NZD'
  | 'CAD'
  | 'CHF'
  | 'SEK'
  | 'NOK'
  | 'DKK'
  | 'ZAR'
  | 'BRL'
  | 'MXN'
  | 'TRY'
  | 'PLN'
  | 'RUB';

export interface CurrencyConfig {
  code: SupportedCurrency;
  name: string;
  symbol: string;
  decimals: number;
  country: string;
  flag: string;
  dialCode: string;
}

export const SUPPORTED_CURRENCIES: Record<SupportedCurrency, CurrencyConfig> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, country: 'United States', flag: '🇺🇸', dialCode: '+1' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, country: 'European Union', flag: '🇪🇺', dialCode: '+49' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, country: 'United Kingdom', flag: '🇬🇧', dialCode: '+44' },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2, country: 'India', flag: '🇮🇳', dialCode: '+91' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2, country: 'United Arab Emirates', flag: '🇦🇪', dialCode: '+971' },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', decimals: 2, country: 'Saudi Arabia', flag: '🇸🇦', dialCode: '+966' },
  QAR: { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', decimals: 2, country: 'Qatar', flag: '🇶🇦', dialCode: '+974' },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', decimals: 3, country: 'Kuwait', flag: '🇰🇼', dialCode: '+965' },
  OMR: { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.', decimals: 3, country: 'Oman', flag: '🇴🇲', dialCode: '+968' },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب', decimals: 3, country: 'Bahrain', flag: '🇧🇭', dialCode: '+973' },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, country: 'Japan', flag: '🇯🇵', dialCode: '+81' },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2, country: 'China', flag: '🇨🇳', dialCode: '+86' },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2, country: 'Hong Kong', flag: '🇭🇰', dialCode: '+852' },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2, country: 'Singapore', flag: '🇸🇬', dialCode: '+65' },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, country: 'Australia', flag: '🇦🇺', dialCode: '+61' },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2, country: 'New Zealand', flag: '🇳🇿', dialCode: '+64' },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2, country: 'Canada', flag: '🇨🇦', dialCode: '+1' },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2, country: 'Switzerland', flag: '🇨🇭', dialCode: '+41' },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2, country: 'Sweden', flag: '🇸🇪', dialCode: '+46' },
  NOK: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2, country: 'Norway', flag: '🇳🇴', dialCode: '+47' },
  DKK: { code: 'DKK', name: 'Danish Krone', symbol: 'kr.', decimals: 2, country: 'Denmark', flag: '🇩🇰', dialCode: '+45' },
  ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2, country: 'South Africa', flag: '🇿🇦', dialCode: '+27' },
  BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2, country: 'Brazil', flag: '🇧🇷', dialCode: '+55' },
  MXN: { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimals: 2, country: 'Mexico', flag: '🇲🇽', dialCode: '+52' },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2, country: 'Turkey', flag: '🇹🇷', dialCode: '+90' },
  PLN: { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', decimals: 2, country: 'Poland', flag: '🇵🇱', dialCode: '+48' },
  RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2, country: 'Russia', flag: '🇷🇺', dialCode: '+7' },
};

export const CURRENCY_LIST: CurrencyConfig[] = Object.values(SUPPORTED_CURRENCIES);

export function getCurrencyConfig(currencyCode?: string): CurrencyConfig {
  if (!currencyCode) return SUPPORTED_CURRENCIES.USD;
  const upper = currencyCode.toUpperCase() as SupportedCurrency;
  return SUPPORTED_CURRENCIES[upper] || SUPPORTED_CURRENCIES.USD;
}

export function getCurrencySymbol(currencyCode?: string): string {
  return getCurrencyConfig(currencyCode).symbol;
}

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_CURRENCIES, code.toUpperCase());
}

export interface FormatOptions {
  showCode?: boolean;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

/**
 * Formats a raw amount in cents/minor units according to its currency configuration.
 * Correctly formats INR with ₹, USD with $, EUR with €, AED with د.إ, SAR with ر.س, etc.
 */
export function formatCurrencyAmount(
  cents: number | undefined | null,
  currencyCode?: string,
  options?: FormatOptions
): string {
  const safeCents = typeof cents === 'number' && !isNaN(cents) ? cents : 0;
  const config = getCurrencyConfig(currencyCode);
  const units = safeCents / Math.pow(10, config.decimals);

  const fractionDigits =
    options?.maximumFractionDigits !== undefined
      ? options.maximumFractionDigits
      : config.decimals;

  const minFractionDigits =
    options?.minimumFractionDigits !== undefined
      ? options.minimumFractionDigits
      : fractionDigits === 0
      ? 0
      : config.decimals;

  let formattedNumber: string;
  try {
    // Determine appropriate locale for nice grouping
    let locale = 'en-US';
    if (config.code === 'INR') locale = 'en-IN';
    else if (config.code === 'EUR') locale = 'de-DE';
    else if (config.code === 'GBP') locale = 'en-GB';
    else if (['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD'].includes(config.code)) locale = 'ar-AE';
    else if (config.code === 'BRL') locale = 'pt-BR';
    else if (config.code === 'JPY') locale = 'ja-JP';

    formattedNumber = units.toLocaleString(locale, {
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  } catch {
    formattedNumber = units.toFixed(fractionDigits);
  }

  // Prepend symbol or append for specific RTL/European currencies
  const isRTL = ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD'].includes(config.code);
  const formattedWithSymbol = isRTL
    ? `${formattedNumber} ${config.symbol}`
    : `${config.symbol}${formattedNumber}`;

  if (options?.showCode) {
    return `${formattedWithSymbol} ${config.code}`;
  }

  return formattedWithSymbol;
}

/**
 * Formats a major currency unit (e.g., 299 for $299.00 or ₹299.00).
 */
export function formatCurrency(
  amount: number | undefined | null,
  currencyCode?: string,
  options?: FormatOptions
): string {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const config = getCurrencyConfig(currencyCode);
  const cents = Math.round(safeAmount * Math.pow(10, config.decimals));
  return formatCurrencyAmount(cents, currencyCode, options);
}
