import { DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

export const MOTION = '(prefers-reduced-motion: no-preference)';
export const WIDE = '(min-width: 900px)';

/** Runs GSAP setup after the host renders, scoped to it and reverted on destroy. */
export function animate(setup: (mm: gsap.MatchMedia, root: HTMLElement) => void): void {
  const root: HTMLElement = inject(ElementRef).nativeElement;
  const mm = gsap.matchMedia(root);
  afterNextRender(() => setup(mm, root));
  inject(DestroyRef).onDestroy(() => mm.revert());
}

export { gsap, ScrollTrigger, SplitText };
