import React from 'react';
import { Provider, createStore } from 'jotai';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { RATING_REACTIONS, curiousAtom, endedInError, reactionAtom } from '../state';
import { EXPRESSIONS } from '../types';
import Mascot from '../index';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

type Props = React.ComponentProps<typeof Mascot>;

function renderMascot(props: Props) {
  const store = createStore();
  const view = render(
    <Provider store={store}>
      <Mascot {...props} />
    </Provider>,
  );
  const rerender = (next: Props) =>
    view.rerender(
      <Provider store={store}>
        <Mascot {...next} />
      </Provider>,
    );
  return { store, rerender, container: view.container, unmount: view.unmount };
}

const getDog = () => screen.getByRole('button', { name: 'com_ui_mascot_pet' });

describe('Mascot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts neutral', () => {
    renderMascot({ isSubmitting: false });

    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('glides in from where the previous instance left (landing → chat)', () => {
    const animate = jest.fn();
    const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });

    rect.mockReturnValue({ left: 400, top: 100, width: 128 } as DOMRect);
    const landing = renderMascot({ isSubmitting: false });
    expect(animate).not.toHaveBeenCalled();
    landing.unmount();

    rect.mockReturnValue({ left: 16, top: 68, width: 44 } as DOMRect);
    renderMascot({ isSubmitting: true });
    const [keyframes] = animate.mock.calls[0];
    expect(keyframes[0].transform).toBe(`translate(384px, 32px) scale(${128 / 44})`);
    expect(keyframes[1].transform).toBe('none');

    rect.mockRestore();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('exposes an accessible name and hides the artwork from assistive tech', () => {
    const { container } = renderMascot({ isSubmitting: false });

    expect(getDog()).toBeInTheDocument();
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('thinks while a response is in flight, then talks and turns proud', () => {
    const { rerender } = renderMascot({ isSubmitting: false });

    rerender({ isSubmitting: true });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.THINKING);

    rerender({ isSubmitting: false });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.TALKING);

    act(() => {
      jest.advanceTimersByTime(1_800);
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.PROUD);

    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('is happy when petted and in love after a burst of pets', () => {
    renderMascot({ isSubmitting: false });

    fireEvent.click(getDog());
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.HAPPY);

    for (let i = 0; i < 4; i++) {
      fireEvent.click(getDog());
    }
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.LOVE);
  });

  it('listens while the composer is focused', () => {
    renderMascot({ isSubmitting: false });
    const textarea = document.createElement('textarea');
    textarea.id = 'prompt-textarea';
    document.body.appendChild(textarea);

    act(() => textarea.focus());
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.LISTENING);

    act(() => textarea.blur());
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
    textarea.remove();
  });

  it('falls asleep when idle and wakes up surprised on activity', () => {
    renderMascot({ isSubmitting: false });

    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SLEEPY);

    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SURPRISED);
  });

  it('plays reactions requested by other features', () => {
    const { store } = renderMascot({ isSubmitting: false });

    act(() => {
      store.set(reactionAtom, {
        id: 1,
        steps: [{ expression: EXPRESSIONS.SAD, durationMs: 1_000 }],
      });
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SAD);
  });

  it('turns sad when the latest message fails', () => {
    const { rerender } = renderMascot({ isSubmitting: false });

    rerender({ isSubmitting: false, failedMessageId: 'm1' });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SAD);

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('falls in love instead of talking when the user says thanks', () => {
    const { rerender } = renderMascot({ isSubmitting: false });

    rerender({ isSubmitting: false, lastUserText: 'Thanks a lot!' });
    rerender({ isSubmitting: true, lastUserText: 'Thanks a lot!' });
    rerender({ isSubmitting: false, lastUserText: 'Thanks a lot!' });

    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.LOVE);
  });

  it('is curious while a conversation starter is hovered', () => {
    const { store } = renderMascot({ isSubmitting: false });

    act(() => store.set(curiousAtom, true));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.CURIOUS);

    act(() => store.set(curiousAtom, false));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('reacts to message ratings', () => {
    const { store } = renderMascot({ isSubmitting: false });

    act(() => store.set(reactionAtom, { id: 1, steps: RATING_REACTIONS.thumbsUp }));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.HAPPY);
  });

  it('blinks at random intervals', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    renderMascot({ isSubmitting: false });

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(getDog()).toHaveAttribute('data-blinking');

    act(() => {
      jest.advanceTimersByTime(180);
    });
    expect(getDog()).not.toHaveAttribute('data-blinking');
    jest.restoreAllMocks();
  });

  describe('with reduced motion', () => {
    beforeEach(() => mockMatchMedia(true));

    it('never blinks and does not track the pointer', () => {
      renderMascot({ isSubmitting: false });

      act(() => {
        jest.advanceTimersByTime(10_000);
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }));
      });

      expect(getDog()).not.toHaveAttribute('data-blinking');
      expect(getDog().style.getPropertyValue('--mascot-eyes-x')).toBe('');
    });
  });

  describe('endedInError', () => {
    const message = (content: unknown[], error?: boolean) =>
      ({ messageId: 'm', content, error }) as unknown as TMessage;

    it('tolerates the empty slots a streamed response has while in flight', () => {
      const sparse: unknown[] = [];
      sparse[2] = { type: ContentTypes.TEXT, text: 'hi' };

      expect(endedInError(message(sparse))).toBe(false);
      expect(endedInError(message([undefined, { type: ContentTypes.TEXT }]))).toBe(false);
    });

    it('detects an error part or the error flag', () => {
      expect(endedInError(message([undefined, { type: ContentTypes.ERROR }]))).toBe(true);
      expect(endedInError(message([], true))).toBe(true);
      expect(endedInError(undefined)).toBe(false);
    });
  });
});
