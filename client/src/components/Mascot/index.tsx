import { useLayoutEffect, useRef } from 'react';
import { useExpression } from './hooks';
import { useLocalize } from '~/hooks';
import { Dog } from './Dog';

const GLIDE_MS = 650;
/** Only glide in when the previous instance left this recently (landing → chat). */
const GLIDE_WINDOW_MS = 600;

/** Where the last instance was when it unmounted, so the next one can glide in from there. */
let lastSeen: { rect: DOMRect; at: number } | null = null;

interface MascotProps {
  /** A response is in flight: the dog thinks, then reacts when it lands. */
  isSubmitting: boolean;
  /** Id of the latest message when it ended in an error: the dog gets sad. */
  failedMessageId?: string | null;
  /** Text of the latest user message: thanks make the dog fall in love. */
  lastUserText?: string;
}

/**
 * The parent decides where she sits (above the greeting, or in the gutter beside the first
 * message). Moving between them she glides from her previous spot, behind the chat content
 * (`zIndex: -1` inside the `isolate`d chat), so the messages appearing then stay readable.
 */
export default function Mascot({ isSubmitting, failedMessageId, lastUserText }: MascotProps) {
  const localize = useLocalize();
  const { expression, pet } = useExpression(isSubmitting, { failedMessageId, lastUserText });
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const from = lastSeen;
    const to = el.getBoundingClientRect();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      from &&
      performance.now() - from.at < GLIDE_WINDOW_MS &&
      from.rect.width > 0 &&
      to.width > 0 &&
      !reduceMotion &&
      typeof el.animate === 'function'
    ) {
      const start = `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px) scale(${from.rect.width / to.width})`;
      el.animate(
        [
          { transform: start, zIndex: -1 },
          { transform: 'none', zIndex: -1 },
        ],
        { duration: GLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    return () => {
      lastSeen = { rect: el.getBoundingClientRect(), at: performance.now() };
    };
  }, []);

  return (
    <div ref={ref} className="relative origin-top-left">
      <Dog
        expression={expression}
        label={localize('com_ui_mascot_pet')}
        onPet={pet}
        className="w-full"
      />
    </div>
  );
}
