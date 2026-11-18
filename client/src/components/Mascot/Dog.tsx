import { useId } from 'react';
import type { Expression } from './types';
import { useEyesFollowPointer, useRandomBlink } from './hooks';
import { cn } from '~/utils';
import './dog.css';

const HEAD_PATH =
  'M 233 0 C 140 0, 84 22, 70 80 C 62 120, 59 160, 59 205 C 60 260, 96 320, 150 345 C 175 355, 205 356, 233 356 C 261 356, 291 355, 316 345 C 370 320, 406 260, 407 205 C 407 160, 404 120, 396 80 C 382 22, 326 0, 233 0 Z';
const EAR_PATH =
  'M 122 3 C 100 2, 62 18, 32 48 C 10 70, 1 106, 4 140 C 7 164, 24 182, 40 189 C 52 187, 59 172, 63 152 C 67 122, 70 84, 86 54 C 98 32, 112 16, 122 3 Z';
const CHEEK_PATH =
  'M 30 205 L 62 204 C 96 202, 128 216, 145 248 C 160 277, 166 316, 168 365 L 30 365 Z';
const EYE_PATH =
  'M 0 -37 C 24 -37, 39 -22, 39 -2 C 39 14, 38 28, 30 34 C 20 39, 6 40, -6 39 C -30 37, -45 22, -45 2 C -45 -18, -26 -37, 0 -37 Z';
const PUPIL_PATH =
  'M 0 -37 C 24 -37, 39 -22, 39 -2 C 39 12, 37 22, 31 27 C 22 31, 10 32, 0 31 C -24 30, -39 18, -39 -2 C -39 -22, -24 -37, 0 -37 Z';
const NOSE_PATH =
  'M 233 255 C 262 255, 283 260, 283 278 C 283 298, 255 315, 233 315 C 211 315, 183 298, 183 278 C 183 260, 204 255, 233 255 Z';
const SPARKLE_PATH =
  'M 0 -6 C 1 -1, 1 -1, 6 0 C 1 1, 1 1, 0 6 C -1 1, -1 1, -6 0 C -1 -1, -1 -1, 0 -6 Z';
const HEART_PATH = 'M 0 10 C -20 -4, -10 -18, 0 -7 C 10 -18, 20 -4, 0 10 Z';

// Mirrors the left side horizontally to draw the right one
const MIRROR_TRANSFORM = 'matrix(-1 0 0 1 466 0)';
// Lowers the ears so their tips do not stick out above the head
const EAR_DROP_TRANSFORM = 'translate(0 16)';

// Sparkles around the head, in 0-100 halo coordinates
const SPARKLES = [
  { x: 9, y: 30, scale: 1, delayS: 0 },
  { x: 91, y: 20, scale: 1.3, delayS: 0.7 },
  { x: 13, y: 76, scale: 0.8, delayS: 1.4 },
  { x: 89, y: 68, scale: 0.9, delayS: 2.1 },
  { x: 50, y: 5, scale: 0.7, delayS: 1 },
  { x: 76, y: 93, scale: 0.6, delayS: 2.6 },
] as const;

// Decorative "zzz" glyphs rendered while sleeping
const SNORE_LETTERS = [
  { letter: 'z', size: 22 },
  { letter: 'Z', size: 28 },
  { letter: 'Z', size: 34 },
] as const;

const EYE_SIDES = {
  LEFT: 'left',
  RIGHT: 'right',
} as const;

type EyeSide = (typeof EYE_SIDES)[keyof typeof EYE_SIDES];

interface DogProps {
  expression: Expression;
  label: string;
  onPet: () => void;
  className?: string;
}

interface DogEyeProps {
  ids: DogIds;
  side: EyeSide;
}

type DogIds = ReturnType<typeof createIds>;

function createIds(prefix: string) {
  return {
    headBase: `${prefix}-head-base`,
    sheen: `${prefix}-sheen`,
    ear: `${prefix}-ear`,
    cheek: `${prefix}-cheek`,
    brow: `${prefix}-brow`,
    nose: `${prefix}-nose`,
    grain: `${prefix}-grain`,
    headClip: `${prefix}-head-clip`,
    eyeClip: `${prefix}-eye-clip`,
  };
}

function DogEye({ ids, side }: DogEyeProps) {
  const isLeft = side === EYE_SIDES.LEFT;

  return (
    <g transform={isLeft ? 'translate(151 181)' : 'translate(315 181) scale(-1 1)'}>
      <g className="mascot__eyes-open">
        <g className="mascot__part mascot__eye">
          <g className="mascot__blink">
            <path d={EYE_PATH} fill="#f4f4f4" />
            <g clipPath={`url(#${ids.eyeClip})`}>
              <g className={cn('mascot__pupil', !isLeft && 'mascot__pupil--mirrored')}>
                <g className="mascot__part mascot__pupil-scale">
                  <path d={PUPIL_PATH} fill="#020202" />
                  <circle
                    className="mascot__shine"
                    cx={isLeft ? -13 : 13}
                    cy="-17"
                    r="8"
                    fill="#ffffff"
                  />
                </g>
              </g>
            </g>
          </g>
        </g>
        <g clipPath={`url(#${ids.eyeClip})`}>
          <g className="mascot__lid">
            <path d="M -60 -170 L 60 -170 L 60 -46 Q 0 -36 -60 -46 Z" fill="#242322" />
            <path
              d="M -60 -46 Q 0 -36 60 -46"
              stroke="#0b0b0b"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
          </g>
          <path
            className="mascot__lower-lid"
            d="M -60 50 Q 0 34 60 50 L 60 120 L -60 120 Z"
            fill="#262524"
          />
        </g>
      </g>
      <path
        className="mascot__eyes-happy"
        d="M -30 12 C -24 -24, 24 -24, 30 12"
        stroke="#050505"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="mascot__eyes-closed"
        d="M -30 6 C -18 22, 18 22, 30 6"
        stroke="#050505"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function DogMouths() {
  return (
    <>
      <g className="mascot__mouth mascot__mouth--neutral">
        <path
          d="M 233 312 L 233 322 M 211 317 C 218 330, 230 330, 233 322 C 236 330, 248 330, 255 317"
          stroke="#0a0a0a"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="mascot__mouth mascot__mouth--happy">
        <path
          d="M 194 304 C 212 313, 254 313, 272 304 C 266 348, 200 348, 194 304 Z"
          fill="#3a1117"
        />
        <path d="M 219 318 C 216 350, 250 350, 247 318 Z" fill="#e8788a" />
        <path d="M 233 322 L 233 334" stroke="#c95466" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="mascot__mouth mascot__mouth--talk">
        <g className="mascot__talk">
          <path
            d="M 208 306 C 220 312, 246 312, 258 306 C 255 336, 211 336, 208 306 Z"
            fill="#3a1117"
          />
          <ellipse cx="233" cy="322" rx="11" ry="6" fill="#e8788a" />
        </g>
      </g>
      <g className="mascot__mouth mascot__mouth--o">
        <ellipse cx="233" cy="330" rx="13" ry="16" fill="#3a1117" />
        <ellipse cx="233" cy="340" rx="8" ry="5" fill="#e8788a" />
      </g>
      <path
        className="mascot__mouth mascot__mouth--smile"
        d="M 204 318 C 216 334, 250 334, 268 312"
        stroke="#0a0a0a"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="mascot__mouth mascot__mouth--sad"
        d="M 212 334 C 222 322, 244 322, 254 334"
        stroke="#0a0a0a"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="mascot__mouth mascot__mouth--thinking"
        d="M 218 328 C 228 322, 236 332, 250 324"
        stroke="#0a0a0a"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function DogEffects() {
  return (
    <>
      <g className="mascot__fx mascot__fx--question">
        <text x="420" y="-5" fontSize="60" fontWeight="700" fill="#48cfad">
          ?
        </text>
      </g>
      <g className="mascot__fx mascot__fx--exclaim">
        <text x="428" y="-5" fontSize="64" fontWeight="800" fill="#f2a654">
          !
        </text>
      </g>
      <g className="mascot__fx mascot__fx--think">
        <circle cx="384" cy="2" r="6" fill="#c4b5fd" />
        <circle cx="406" cy="-18" r="9" fill="#c4b5fd" />
        <circle cx="436" cy="-38" r="13" fill="#c4b5fd" />
      </g>
      <g className="mascot__fx mascot__fx--zzz">
        {SNORE_LETTERS.map(({ letter, size }) => (
          <text key={size} x="395" y="0" fontSize={size} fontWeight="700" fill="#9ca3af">
            {letter}
          </text>
        ))}
      </g>
      <g className="mascot__fx mascot__fx--love">
        <g transform="translate(40 -5) scale(1.6)">
          <path d={HEART_PATH} fill="#ff6b81" />
        </g>
        <g transform="translate(425 -10) scale(1.9)">
          <path d={HEART_PATH} fill="#ff8fa3" />
        </g>
        <g transform="translate(375 -30) scale(1.1)">
          <path d={HEART_PATH} fill="#ff6b81" />
        </g>
      </g>
    </>
  );
}

export function Dog({ expression, label, onPet, className }: DogProps) {
  const containerRef = useEyesFollowPointer<HTMLButtonElement>();
  useRandomBlink(containerRef);
  // Unique prefix so SVG ids never collide between instances
  const ids = createIds(`mascot-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`);

  return (
    <button
      type="button"
      ref={containerRef}
      data-expr={expression}
      className={cn('mascot-container', className)}
      onClick={onPet}
      aria-label={label}
    >
      <span className="mascot__glow" aria-hidden="true" />
      <svg className="mascot__sparkles" viewBox="0 0 100 100" aria-hidden="true">
        {SPARKLES.map(({ x, y, scale, delayS }) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
            <path
              className="mascot__sparkle"
              d={SPARKLE_PATH}
              style={{ animationDelay: `${delayS}s` }}
            />
          </g>
        ))}
      </svg>
      <svg
        className="mascot"
        aria-hidden="true"
        focusable="false"
        viewBox="-4 -4 474 366"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={ids.headBase} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#211f1e" />
            <stop offset="100%" stopColor="#292827" />
          </linearGradient>
          <radialGradient id={ids.sheen} cx="0.5" cy="0.35" r="0.6">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.ear} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="190">
            <stop offset="0%" stopColor="#262626" />
            <stop offset="55%" stopColor="#161616" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
          <radialGradient id={ids.cheek} gradientUnits="userSpaceOnUse" cx="165" cy="222" r="150">
            <stop offset="0%" stopColor="#ffbb6c" />
            <stop offset="45%" stopColor="#f2a457" />
            <stop offset="80%" stopColor="#c67a35" />
            <stop offset="100%" stopColor="#8f5222" />
          </radialGradient>
          <linearGradient id={ids.brow} x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="#f6ac5c" />
            <stop offset="100%" stopColor="#a9642b" />
          </linearGradient>
          <linearGradient id={ids.nose} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#363534" />
            <stop offset="100%" stopColor="#111111" />
          </linearGradient>

          <filter id={ids.grain}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={4}
              result="n"
            />
            <feColorMatrix in="n" type="saturate" values="0" result="g" />
            <feComponentTransfer in="g" result="g2">
              <feFuncR type="linear" slope="0.3" intercept="0.78" />
              <feFuncG type="linear" slope="0.3" intercept="0.78" />
              <feFuncB type="linear" slope="0.3" intercept="0.78" />
              <feFuncA type="linear" slope="0" intercept="1" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="g2" mode="multiply" result="b" />
            <feComposite in="b" in2="SourceGraphic" operator="in" />
          </filter>

          <clipPath id={ids.headClip}>
            <path d={HEAD_PATH} />
          </clipPath>
          <clipPath id={ids.eyeClip}>
            <path d={EYE_PATH} />
          </clipPath>
        </defs>

        <g className="mascot__face">
          {/* Head */}
          <path d={HEAD_PATH} fill={`url(#${ids.headBase})`} />
          <g clipPath={`url(#${ids.headClip})`}>
            <ellipse cx="233" cy="70" rx="170" ry="90" fill={`url(#${ids.sheen})`} />
          </g>

          {/* Cheeks */}
          <g clipPath={`url(#${ids.headClip})`}>
            <g filter={`url(#${ids.grain})`}>
              <path d={CHEEK_PATH} fill={`url(#${ids.cheek})`} />
              <path transform={MIRROR_TRANSFORM} d={CHEEK_PATH} fill={`url(#${ids.cheek})`} />
            </g>
          </g>

          {/* Blush */}
          <ellipse className="mascot__blush" cx="118" cy="258" rx="20" ry="10" fill="#ff7b8a" />
          <ellipse className="mascot__blush" cx="348" cy="258" rx="20" ry="10" fill="#ff7b8a" />

          {/* Ears */}
          <g transform={EAR_DROP_TRANSFORM}>
            <path
              className="mascot__part mascot__ear mascot__ear--left"
              d={EAR_PATH}
              fill={`url(#${ids.ear})`}
            />
            <g transform={MIRROR_TRANSFORM}>
              <path
                className="mascot__part mascot__ear mascot__ear--right"
                d={EAR_PATH}
                fill={`url(#${ids.ear})`}
              />
            </g>
          </g>

          {/* Brows */}
          <g className="mascot__part mascot__brow mascot__brow--left">
            <rect
              x="111"
              y="86"
              width="56"
              height="30"
              rx="15"
              transform="rotate(-6 139 101)"
              fill={`url(#${ids.brow})`}
            />
          </g>
          <g transform={MIRROR_TRANSFORM}>
            <g className="mascot__part mascot__brow mascot__brow--right">
              <rect
                x="111"
                y="86"
                width="56"
                height="30"
                rx="15"
                transform="rotate(-6 139 101)"
                fill={`url(#${ids.brow})`}
              />
            </g>
          </g>

          <DogEye ids={ids} side={EYE_SIDES.LEFT} />
          <DogEye ids={ids} side={EYE_SIDES.RIGHT} />

          {/* Tear */}
          <g className="mascot__fx mascot__fx--tear">
            <path
              d="M 110 214 C 103 226, 102 234, 110 239 C 118 234, 117 226, 110 214 Z"
              fill="#7cc7ff"
            />
          </g>

          <DogMouths />

          {/* Nose */}
          <path d={NOSE_PATH} fill={`url(#${ids.nose})`} />
          <ellipse cx="233" cy="265" rx="22" ry="5" fill="#ffffff" opacity="0.07" />
        </g>

        <DogEffects />
      </svg>
    </button>
  );
}
