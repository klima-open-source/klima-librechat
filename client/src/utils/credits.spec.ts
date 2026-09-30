import { CREDITS_PER_USD, creditsToUsd, formatCreditsAsCurrency } from './credits';

describe('creditsToUsd', () => {
  it('treats one million credits as one dollar', () => {
    expect(creditsToUsd(CREDITS_PER_USD)).toBe(1);
    expect(creditsToUsd(20 * CREDITS_PER_USD)).toBe(20);
  });

  it('matches the spend a request records', () => {
    /** 1,000 prompt tokens on a $0.75 per 1M model: `tokens × rate` credits. */
    expect(creditsToUsd(1000 * 0.75)).toBeCloseTo(0.00075, 10);
  });
});

describe('formatCreditsAsCurrency', () => {
  it('renders a starting balance as the money it represents', () => {
    expect(formatCreditsAsCurrency(20 * CREDITS_PER_USD, 'en-US')).toBe('$20.00');
  });

  it('renders zero and exhausted balances as zero', () => {
    expect(formatCreditsAsCurrency(0, 'en-US')).toBe('$0.00');
  });

  it('keeps a sub-cent amount visible instead of rounding it to nothing', () => {
    expect(formatCreditsAsCurrency(750, 'en-US')).toBe('$0.00075');
  });

  it('keeps two decimals once the amount reaches a cent', () => {
    expect(formatCreditsAsCurrency(12_345_678, 'en-US')).toBe('$12.35');
  });

  it('follows the reader locale', () => {
    expect(formatCreditsAsCurrency(20 * CREDITS_PER_USD, 'es-CO').replace(/\s/g, ' ')).toContain(
      '20,00',
    );
  });
});
