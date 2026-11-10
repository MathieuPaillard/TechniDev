// Scène : un canvas qui suit la taille de son cadre et la densité de l'écran, plus de quoi convertir la
// position du pointeur. Les simulations dessinent en pixels CSS ; la mise à l'échelle est faite ici.

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Taille du cadre en pixels CSS. */
  width: number;
  height: number;
  /** Pixels réels par pixel CSS (plafonné à 2 : au-delà, le coût ne se voit plus). */
  ratio: number;
  /** Position d'un événement pointeur dans la scène, en pixels CSS. */
  pointer(event: PointerEvent | MouseEvent): { x: number; y: number };
  /** Arrête de suivre la taille du cadre. */
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement, onResize?: (stage: Stage) => void): Stage {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');

  const stage: Stage = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    ratio: 1,
    pointer(event) {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    },
    dispose() {
      observer.disconnect();
    },
  };

  const measure = (): void => {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (width === stage.width && height === stage.height && ratio === stage.ratio) return;
    stage.width = width;
    stage.height = height;
    stage.ratio = ratio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    onResize?.(stage);
  };

  const observer = new ResizeObserver(measure);
  observer.observe(canvas);
  measure();
  return stage;
}
