import { atom, useSetAtom } from 'jotai';
import type { ExpressionStep } from './types';
import { EXPRESSIONS } from './types';

interface ReactionRequest {
  id: number;
  steps: ExpressionStep[];
}

/** Write-only channel for other features to ask the mascot to play a timed reaction. */
export const reactionAtom = atom<ReactionRequest | null>(null);

let nextRequestId = 0;

export function useReact() {
  const setReaction = useSetAtom(reactionAtom);
  return (steps: ExpressionStep[]) => setReaction({ id: ++nextRequestId, steps });
}

/** True while the pointer rests on a conversation starter: the dog tilts its head. */
export const curiousAtom = atom(false);

export const RATING_REACTIONS: Record<'thumbsUp' | 'thumbsDown', ExpressionStep[]> = {
  thumbsUp: [{ expression: EXPRESSIONS.HAPPY, durationMs: 1_800 }],
  thumbsDown: [{ expression: EXPRESSIONS.SAD, durationMs: 2_500 }],
};
