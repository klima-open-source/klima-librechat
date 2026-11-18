import React from 'react';
import { Provider, createStore } from 'jotai';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RATING_REACTIONS, curiousAtom, reactionAtom } from '../state';
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
  return { store, rerender, container: view.container };
}

const getDog = () => screen.getByRole('button', { name: 'com_ui_mascot_pet' });
const getHost = (container: HTMLElement) => container.querySelector('.mascot-host');

describe('Mascot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('floats centered while the conversation is empty', () => {
    const { container } = renderMascot({ isLanding: true, isSubmitting: false });

    expect(getHost(container)).toHaveAttribute('data-placement', 'center');
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('settles in the corner once the conversation has messages', () => {
    const { container, rerender } = renderMascot({ isLanding: true, isSubmitting: false });
    rerender({ isLanding: false, isSubmitting: false });

    expect(getHost(container)).toHaveAttribute('data-placement', 'corner');
  });

  it('exposes an accessible name and hides the artwork from assistive tech', () => {
    const { container } = renderMascot({ isLanding: true, isSubmitting: false });

    expect(getDog()).toBeInTheDocument();
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('thinks while a response is in flight, then talks and turns proud', () => {
    const { rerender } = renderMascot({ isLanding: false, isSubmitting: false });

    rerender({ isLanding: false, isSubmitting: true });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.THINKING);

    rerender({ isLanding: false, isSubmitting: false });
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
    renderMascot({ isLanding: true, isSubmitting: false });

    fireEvent.click(getDog());
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.HAPPY);

    for (let i = 0; i < 4; i++) {
      fireEvent.click(getDog());
    }
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.LOVE);
  });

  it('listens while the composer is focused', () => {
    renderMascot({ isLanding: true, isSubmitting: false });
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
    renderMascot({ isLanding: true, isSubmitting: false });

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
    const { store } = renderMascot({ isLanding: false, isSubmitting: false });

    act(() => {
      store.set(reactionAtom, {
        id: 1,
        steps: [{ expression: EXPRESSIONS.SAD, durationMs: 1_000 }],
      });
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SAD);
  });

  it('turns sad when the latest message fails', () => {
    const { rerender } = renderMascot({ isLanding: false, isSubmitting: false });

    rerender({ isLanding: false, isSubmitting: false, failedMessageId: 'm1' });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.SAD);

    act(() => {
      jest.advanceTimersByTime(3_000);
    });
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('falls in love instead of talking when the user says thanks', () => {
    const { rerender } = renderMascot({ isLanding: false, isSubmitting: false });

    rerender({ isLanding: false, isSubmitting: false, lastUserText: 'Thanks a lot!' });
    rerender({ isLanding: false, isSubmitting: true, lastUserText: 'Thanks a lot!' });
    rerender({ isLanding: false, isSubmitting: false, lastUserText: 'Thanks a lot!' });

    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.LOVE);
  });

  it('is curious while a conversation starter is hovered', () => {
    const { store } = renderMascot({ isLanding: true, isSubmitting: false });

    act(() => store.set(curiousAtom, true));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.CURIOUS);

    act(() => store.set(curiousAtom, false));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.NEUTRAL);
  });

  it('reacts to message ratings', () => {
    const { store } = renderMascot({ isLanding: false, isSubmitting: false });

    act(() => store.set(reactionAtom, { id: 1, steps: RATING_REACTIONS.thumbsUp }));
    expect(getDog()).toHaveAttribute('data-expr', EXPRESSIONS.HAPPY);
  });

  it('blinks at random intervals', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    renderMascot({ isLanding: true, isSubmitting: false });

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
      renderMascot({ isLanding: true, isSubmitting: false });

      act(() => {
        jest.advanceTimersByTime(10_000);
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }));
      });

      expect(getDog()).not.toHaveAttribute('data-blinking');
      expect(getDog().style.getPropertyValue('--mascot-eyes-x')).toBe('');
    });
  });
});
