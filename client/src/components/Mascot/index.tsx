import { useEffect, useRef } from 'react';
import { useExpression } from './hooks';
import { useLocalize } from '~/hooks';
import { Dog } from './Dog';
import './host.css';

/** Greeting block the centered dog sits above (see `Landing`). */
const ANCHOR_SELECTOR = '[data-mascot-anchor]';
const LANDING_GAP_PX = 8;
const MIN_TOP_PX = 8;

interface MascotProps {
  /** Empty conversation: the dog floats centered. Otherwise it settles in the corner. */
  isLanding: boolean;
  /** A response is in flight: the dog thinks, then reacts when it lands. */
  isSubmitting: boolean;
  /** Id of the latest message when it ended in an error: the dog gets sad. */
  failedMessageId?: string | null;
  /** Text of the latest user message: thanks make the dog fall in love. */
  lastUserText?: string;
}

/**
 * Lives inside a `relative` chat container. The wrapper ignores pointer events so it never
 * blocks the chat; only the dog itself is interactive.
 */
export default function Mascot({
  isLanding,
  isSubmitting,
  failedMessageId,
  lastUserText,
}: MascotProps) {
  const localize = useLocalize();
  const { expression, pet } = useExpression(isSubmitting, { failedMessageId, lastUserText });
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const container = host?.parentElement;
    const anchor = container?.querySelector<HTMLElement>(ANCHOR_SELECTOR);
    if (!host || !container || !anchor || !isLanding) {
      host?.style.removeProperty('--mascot-landing-top');
      return;
    }

    const place = () => {
      const top =
        anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        host.offsetHeight -
        LANDING_GAP_PX;
      host.style.setProperty('--mascot-landing-top', `${Math.max(top, MIN_TOP_PX)}px`);
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isLanding]);

  return (
    <div ref={hostRef} className="mascot-host" data-placement={isLanding ? 'center' : 'corner'}>
      <Dog
        expression={expression}
        label={localize('com_ui_mascot_pet')}
        onPet={pet}
        className="mascot-host__dog"
      />
    </div>
  );
}
