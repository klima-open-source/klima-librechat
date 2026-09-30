/**
 * Balances are stored as token credits, a fixed-point USD unit: the spend recorded for a
 * request is `tokens × rate`, where `rate` is the model's USD price per 1M tokens, so one
 * credit is one millionth of a dollar regardless of which model produced the spend.
 */
export const CREDITS_PER_USD = 1_000_000;

export const creditsToUsd = (credits: number): number => credits / CREDITS_PER_USD;

/**
 * Below one cent a two-decimal amount renders as `$0.00`, which reads as free rather than as
 * small — the cost of a single cheap request lands here. Those amounts get enough decimals to
 * stay visible; anything a user would recognise as money keeps the familiar two.
 */
const SUB_CENT_FRACTION_DIGITS = 6;

const isSubCent = (usd: number): boolean => usd !== 0 && Math.abs(usd) < 0.01;

/** Renders a credit balance as the money it represents, in the reader's locale. */
export function formatCreditsAsCurrency(credits: number, locale?: string): string {
  const usd = creditsToUsd(credits);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: isSubCent(usd) ? SUB_CENT_FRACTION_DIGITS : 2,
  }).format(usd);
}
