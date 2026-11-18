import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { RefObject } from 'react';
import type { Expression, ExpressionStep } from './types';
import { curiousAtom, reactionAtom } from './state';
import { mainTextareaId } from '~/common';
import { EXPRESSIONS } from './types';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Distance (in avatar widths) at which the eyes reach their maximum offset */
const FULL_OFFSET_DISTANCE_RATIO = 2.5;

const BLINK_DURATION_MS = 180;
const MIN_BLINK_INTERVAL_MS = 3_000;
const MAX_BLINK_INTERVAL_MS = 7_000;
const BLINKING_ATTRIBUTE = 'data-blinking';

/** Idle time before the dog falls asleep */
const SLEEP_AFTER_MS = 15_000;
/** Rapid clicks that make the dog fall in love */
const PET_BURST_COUNT = 5;
const PET_BURST_WINDOW_MS = 1_500;
/** Keeps the click that wakes the dog from counting as a pet */
const WAKE_GRACE_MS = 150;

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;

const PET_REACTION: ExpressionStep = { expression: EXPRESSIONS.HAPPY, durationMs: 1_400 };
const LOVE_REACTION: ExpressionStep = { expression: EXPRESSIONS.LOVE, durationMs: 2_500 };
const WAKE_REACTION: ExpressionStep = { expression: EXPRESSIONS.SURPRISED, durationMs: 800 };
const ERROR_REACTION: ExpressionStep = { expression: EXPRESSIONS.SAD, durationMs: 3_000 };
const THANKS_PATTERN = /thank|gracias|te quiero|love you|genial|excelente|great job|awesome/i;
const RESPONSE_REACTION: ExpressionStep[] = [
  { expression: EXPRESSIONS.TALKING, durationMs: 1_800 },
  { expression: EXPRESSIONS.PROUD, durationMs: 1_500 },
];

/**
 * Exposes `--mascot-eyes-x` and `--mascot-eyes-y` (normalized to -1..1) on the element,
 * so the CSS decides how far the pupils move.
 */
export function useEyesFollowPointer<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    let frameId = 0;

    function handlePointerMove(event: PointerEvent) {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (!element) {
          return;
        }
        const rect = element.getBoundingClientRect();
        const deltaX = event.clientX - (rect.left + rect.width / 2);
        const deltaY = event.clientY - (rect.top + rect.height / 2);
        const distance = Math.hypot(deltaX, deltaY);
        if (distance === 0) {
          return;
        }
        const strength = Math.min(distance / (rect.width * FULL_OFFSET_DISTANCE_RATIO), 1);
        element.style.setProperty('--mascot-eyes-x', `${(deltaX / distance) * strength}`);
        element.style.setProperty('--mascot-eyes-y', `${(deltaY / distance) * strength}`);
      });
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return elementRef;
}

function randomInterval() {
  return MIN_BLINK_INTERVAL_MS + Math.random() * (MAX_BLINK_INTERVAL_MS - MIN_BLINK_INTERVAL_MS);
}

/** Flags the element with `data-blinking` at random intervals so both eyes blink together. */
export function useRandomBlink(elementRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      return;
    }

    let blinkTimer = 0;
    let openTimer = 0;

    function scheduleBlink() {
      blinkTimer = window.setTimeout(() => {
        element?.setAttribute(BLINKING_ATTRIBUTE, '');
        openTimer = window.setTimeout(() => {
          element?.removeAttribute(BLINKING_ATTRIBUTE);
          scheduleBlink();
        }, BLINK_DURATION_MS);
      }, randomInterval());
    }

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(openTimer);
      element.removeAttribute(BLINKING_ATTRIBUTE);
    };
  }, [elementRef]);
}

/** True while the main chat textarea has focus. */
function useComposerFocus() {
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const isComposer = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.id === mainTextareaId;
    const onFocusIn = (event: FocusEvent) => isComposer(event.target) && setIsFocused(true);
    const onFocusOut = (event: FocusEvent) => isComposer(event.target) && setIsFocused(false);

    setIsFocused(isComposer(document.activeElement));
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return isFocused;
}

function resolveExpression(flags: {
  isThinking: boolean;
  reaction: Expression | null;
  isListening: boolean;
  isCurious: boolean;
  isSleepy: boolean;
}): Expression {
  if (flags.isThinking) {
    return EXPRESSIONS.THINKING;
  }
  if (flags.reaction) {
    return flags.reaction;
  }
  if (flags.isListening) {
    return EXPRESSIONS.LISTENING;
  }
  if (flags.isCurious) {
    return EXPRESSIONS.CURIOUS;
  }
  if (flags.isSleepy) {
    return EXPRESSIONS.SLEEPY;
  }
  return EXPRESSIONS.NEUTRAL;
}

/**
 * Decides the dog's expression from what happens in the chat: timed reactions (pets,
 * responses, requests from other features) outrank background states (listening, sleepy).
 */
export function useExpression(
  isThinking: boolean,
  {
    failedMessageId,
    lastUserText,
  }: { failedMessageId?: string | null; lastUserText?: string } = {},
) {
  const [reaction, setReaction] = useState<Expression | null>(null);
  const [isSleepy, setIsSleepy] = useState(false);
  const isListening = useComposerFocus();
  const request = useAtomValue(reactionAtom);
  const isCurious = useAtomValue(curiousAtom);
  const isThanksRef = useRef(false);

  const reactionTimerRef = useRef(0);
  const petTimesRef = useRef<number[]>([]);
  const wokeAtRef = useRef(0);
  const wasThinkingRef = useRef(false);
  const stateRef = useRef({ expression: EXPRESSIONS.NEUTRAL as Expression });

  const expression = resolveExpression({ isThinking, reaction, isListening, isCurious, isSleepy });
  stateRef.current.expression = expression;

  function play(steps: ExpressionStep[], index = 0) {
    window.clearTimeout(reactionTimerRef.current);
    const step = steps.at(index);
    if (!step) {
      setReaction(null);
      return;
    }
    setReaction(step.expression);
    reactionTimerRef.current = window.setTimeout(() => play(steps, index + 1), step.durationMs);
  }
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    if (wasThinkingRef.current && !isThinking) {
      playRef.current(isThanksRef.current ? [LOVE_REACTION] : RESPONSE_REACTION);
    }
    wasThinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    isThanksRef.current = lastUserText != null && THANKS_PATTERN.test(lastUserText);
  }, [lastUserText]);

  const handledFailureRef = useRef(failedMessageId);
  useEffect(() => {
    if (failedMessageId != null && failedMessageId !== handledFailureRef.current) {
      playRef.current([ERROR_REACTION]);
    }
    handledFailureRef.current = failedMessageId;
  }, [failedMessageId]);

  useEffect(() => {
    if (request) {
      playRef.current(request.steps);
    }
  }, [request]);

  useEffect(() => {
    let sleepTimer = 0;

    function scheduleSleep() {
      window.clearTimeout(sleepTimer);
      sleepTimer = window.setTimeout(() => {
        if (stateRef.current.expression === EXPRESSIONS.NEUTRAL) {
          setIsSleepy(true);
        }
        scheduleSleep();
      }, SLEEP_AFTER_MS);
    }

    function onActivity() {
      if (stateRef.current.expression === EXPRESSIONS.SLEEPY) {
        wokeAtRef.current = Date.now();
        setIsSleepy(false);
        playRef.current([WAKE_REACTION]);
      }
      scheduleSleep();
    }

    scheduleSleep();
    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, onActivity, { capture: true }),
    );
    return () => {
      window.clearTimeout(sleepTimer);
      window.clearTimeout(reactionTimerRef.current);
      ACTIVITY_EVENTS.forEach((event) =>
        document.removeEventListener(event, onActivity, { capture: true }),
      );
    };
  }, []);

  function pet() {
    const now = Date.now();
    if (isThinking || now - wokeAtRef.current < WAKE_GRACE_MS) {
      return;
    }
    const recentPets = petTimesRef.current.filter((time) => now - time < PET_BURST_WINDOW_MS);
    recentPets.push(now);

    if (recentPets.length >= PET_BURST_COUNT) {
      petTimesRef.current = [];
      play([LOVE_REACTION]);
      return;
    }
    petTimesRef.current = recentPets;
    play([PET_REACTION]);
  }

  return { expression, pet };
}
