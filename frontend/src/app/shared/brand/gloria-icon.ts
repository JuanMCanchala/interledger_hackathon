import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bespoke vector emblem for GlorIA — MiPlante's voice & text AI assistant.
 * Combines an expressive AI agent visor/core, orbital network nodes, and
 * a four-point intelligence star in the MiPlante palette (--lima / --monte).
 */
@Component({
  selector: 'app-gloria-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class.is-awake]': 'awake()',
    '[class.is-listening]': 'listening()',
  },
  template: `
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="gloria-svg"
    >
      <!-- Subtle orbital intelligence ring -->
      <circle
        cx="32"
        cy="34"
        r="26"
        class="orbit-ring"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-dasharray="4 4"
      />

      <!-- Top antenna / neural connection -->
      <path
        d="M32 7.5V14.5"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
      />
      <circle cx="32" cy="6.5" r="3" class="spark-fill" />

      <!-- Side acoustic / voice-wave nodes -->
      <path
        d="M5.5 30V38"
        class="wave-bar wave-left"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
      />
      <path
        d="M58.5 30V38"
        class="wave-bar wave-right"
        stroke="currentColor"
        stroke-width="2.8"
        stroke-linecap="round"
      />

      <!-- Main AI Agent head / squircle chassis -->
      <rect
        x="11"
        y="14.5"
        width="42"
        height="37"
        rx="15"
        class="agent-shell"
        stroke-width="2.4"
      />

      <!-- Inner dark visor screen -->
      <rect
        x="16"
        y="20.5"
        width="32"
        height="19.5"
        rx="9.75"
        class="agent-visor"
      />

      <!-- Expressive AI eyes (glowing nodes inside visor) -->
      <g class="agent-eyes">
        <rect x="21.5" y="26.5" width="5.2" height="7.5" rx="2.6" class="visor-glow" />
        <rect x="37.3" y="26.5" width="5.2" height="7.5" rx="2.6" class="visor-glow" />
      </g>

      <!-- Subtle friendly smile / voice waveform arc -->
      <path
        d="M27.5 45C29.2 46.8 34.8 46.8 36.5 45"
        class="agent-smile"
        stroke-width="2.3"
        stroke-linecap="round"
      />

      <!-- AI 4-point sparkle badge (top-right crest) -->
      <path
        d="M50.5 6.5L52.5 12.2L58.2 14.2L52.5 16.2L50.5 21.9L48.5 16.2L42.8 14.2L48.5 12.2L50.5 6.5Z"
        class="spark-crest"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: 100%;
      height: 100%;
      aspect-ratio: 1;
      color: var(--gloria-ink, currentColor);
    }

    .gloria-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .orbit-ring {
      opacity: 0.35;
      transform-origin: 32px 34px;
      transition: opacity 0.25s ease, transform 0.4s ease;
    }

    .agent-shell {
      fill: var(--gloria-shell, var(--lima));
      stroke: var(--gloria-border, var(--monte-hondo));
    }

    .agent-visor {
      fill: var(--gloria-visor, var(--monte-hondo));
    }

    .visor-glow {
      fill: var(--gloria-glow, var(--lima));
      transition: transform 0.2s ease;
      transform-origin: center;
    }

    .agent-smile {
      stroke: var(--gloria-border, var(--monte-hondo));
    }

    .spark-fill {
      fill: currentColor;
    }

    .spark-crest {
      fill: var(--gloria-spark, var(--papel));
      stroke: var(--gloria-border, var(--monte-hondo));
      stroke-width: 1.8;
      stroke-linejoin: round;
      transform-origin: 50.5px 14.2px;
      transition: transform 0.3s ease;
    }

    :host(.is-awake) .orbit-ring,
    :host(.is-listening) .orbit-ring {
      opacity: 0.75;
    }

    :host(.is-listening) .wave-bar {
      animation: gloria-wave 0.85s ease-in-out infinite alternate;
    }

    :host(.is-listening) .spark-crest {
      animation: gloria-spark-pulse 1.1s ease-in-out infinite alternate;
    }

    @keyframes gloria-wave {
      from {
        transform: scaleY(0.75);
      }
      to {
        transform: scaleY(1.35);
      }
    }

    @keyframes gloria-spark-pulse {
      from {
        transform: scale(0.92) rotate(-6deg);
      }
      to {
        transform: scale(1.14) rotate(6deg);
      }
    }
  `,
})
export class GloriaIcon {
  readonly awake = input(false);
  readonly listening = input(false);
}
