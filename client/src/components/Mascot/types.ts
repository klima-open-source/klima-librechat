export const EXPRESSIONS = {
  NEUTRAL: 'neutral',
  HAPPY: 'happy',
  PROUD: 'proud',
  CURIOUS: 'curious',
  LISTENING: 'listening',
  THINKING: 'thinking',
  TALKING: 'talking',
  SURPRISED: 'surprised',
  SAD: 'sad',
  SLEEPY: 'sleepy',
  LOVE: 'love',
} as const;

export type Expression = (typeof EXPRESSIONS)[keyof typeof EXPRESSIONS];

export interface ExpressionStep {
  expression: Expression;
  durationMs: number;
}
