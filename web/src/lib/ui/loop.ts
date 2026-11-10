// Boucle d'animation d'une simulation. Elle s'arrête d'elle-même quand l'onglet est caché ou que la scène
// sort de l'écran, et borne le temps écoulé entre deux images (pas de bond au retour sur l'onglet).

export interface Loop {
  /** Vrai si le visiteur n'a pas mis en pause. */
  readonly playing: boolean;
  play(): void;
  pause(): void;
  toggle(): boolean;
  /** Dessine une image sans avancer le temps (après un réglage fait en pause, par exemple). */
  redraw(): void;
  stop(): void;
}

export interface LoopOptions {
  /** L'élément dont la visibilité à l'écran conditionne l'animation. */
  element: Element;
  /** Appelé à chaque image avec le temps écoulé en secondes (0 pour un simple redessin). */
  frame: (dt: number) => void;
  /** Démarrer en pause (c'est le cas quand le système demande de réduire les animations). */
  startPaused?: boolean;
}

const MAX_FRAME_SECONDS = 1 / 20;

export function startLoop({ element, frame, startPaused = false }: LoopOptions): Loop {
  let playing = !startPaused;
  let visible = true;
  let handle = 0;
  let last = 0;
  let stopped = false;

  const active = (): boolean => playing && visible && !document.hidden && !stopped;

  const tick = (now: number): void => {
    handle = 0;
    if (!active()) return;
    const dt = last === 0 ? 1 / 60 : Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    frame(dt);
    handle = requestAnimationFrame(tick);
  };

  const schedule = (): void => {
    if (handle || !active()) return;
    last = 0;
    handle = requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  observer.observe(element);

  const onVisibility = (): void => schedule();
  document.addEventListener('visibilitychange', onVisibility);

  schedule();
  // Une première image, même en pause : la scène ne doit jamais rester vide.
  requestAnimationFrame(() => {
    if (!active()) frame(0);
  });

  return {
    get playing() {
      return playing;
    },
    play() {
      playing = true;
      schedule();
    },
    pause() {
      playing = false;
    },
    toggle() {
      playing = !playing;
      schedule();
      return playing;
    },
    redraw() {
      if (!active() && !stopped) frame(0);
    },
    stop() {
      stopped = true;
      if (handle) cancelAnimationFrame(handle);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
