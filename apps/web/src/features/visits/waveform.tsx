'use client';

import { useEffect, useRef } from 'react';

import { barHeight, createLevelHistory, peakLevel } from '@/lib/audio/level-meter';

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_EVERY_MS = 60;
/** More bars than the widest layout can show. */
const MAX_BARS = 400;
const MIN_BAR_HEIGHT = 2;

/**
 * A scrolling picture of the microphone's level: one bar per moment, newest on
 * the right. Its job is to show that the microphone is picking something up.
 * It is decoration to assistive technology, which is told "Recording" in text.
 */
export function Waveform({ analyser }: { analyser: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas === null || context === null || context === undefined) {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    const history = createLevelHistory(MAX_BARS);
    let loudest = 0;
    let lastBarAt = 0;
    let frame = 0;

    const paint = (): void => {
      const ratio = window.devicePixelRatio;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      // Match the backing store to the screen's pixels, or the bars look soft.
      if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      // The canvas inherits the accent colour as its text colour, so it follows the theme.
      context.fillStyle = getComputedStyle(canvas).color;

      const step = BAR_WIDTH + BAR_GAP;
      const levels = history.latest(Math.floor(width / step));
      const left = width - levels.length * step;
      levels.forEach((level, index) => {
        const barLength = Math.max(barHeight(level) * height, MIN_BAR_HEIGHT);
        context.beginPath();
        context.roundRect(
          left + index * step,
          (height - barLength) / 2,
          BAR_WIDTH,
          barLength,
          BAR_WIDTH / 2,
        );
        context.fill();
      });
    };

    const tick = (now: number): void => {
      analyser.getByteTimeDomainData(samples);
      loudest = Math.max(loudest, peakLevel(samples));
      if (now - lastBarAt >= BAR_EVERY_MS) {
        history.push(loudest);
        loudest = 0;
        lastBarAt = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [analyser]);

  return <canvas ref={canvasRef} aria-hidden className="block h-16 w-full text-primary" />;
}
