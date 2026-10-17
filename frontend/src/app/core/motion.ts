import { DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, DrawSVGPlugin);

export const MOTION = '(prefers-reduced-motion: no-preference)';
const NAV_OFFSET_PX = 72;
export const FINE_POINTER = '(pointer: fine) and (prefers-reduced-motion: no-preference)';

/** Runs GSAP setup after the host renders, scoped to it and reverted on destroy. */
export function animate(setup: (mm: gsap.MatchMedia, root: HTMLElement) => void): void {
  const root: HTMLElement = inject(ElementRef).nativeElement;
  const mm = gsap.matchMedia(root);
  afterNextRender(() => setup(mm, root));
  inject(DestroyRef).onDestroy(() => mm.revert());
}

export function scrollToSection(hash: string): void {
  const target = document.querySelector<HTMLElement>(hash);
  if (!target) return;
  const smoother = ScrollSmoother.get();
  if (smoother) smoother.scrollTo(target, true, `top ${NAV_OFFSET_PX}px`);
  else scrollTo({ top: target.getBoundingClientRect().top + scrollY - NAV_OFFSET_PX, behavior: matchMedia(MOTION).matches ? 'smooth' : 'auto' });
}

export { gsap, ScrollSmoother, ScrollTrigger, SplitText };
