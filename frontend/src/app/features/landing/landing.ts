import { ChangeDetectionStrategy, Component } from '@angular/core';
import { animate, ScrollTrigger } from '../../core/motion';
import { Logo } from '../../shared/brand/logo';
import { Closing } from './sections/closing/closing';
import { Hero } from './sections/hero/hero';
import { Preview } from './sections/preview/preview';
import { Purpose } from './sections/purpose/purpose';
import { Story } from './sections/story/story';

@Component({
  selector: 'app-landing',
  imports: [Logo, Hero, Purpose, Story, Preview, Closing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export default class Landing {
  constructor() {
    animate((mm) =>
      mm.add('all', () => {
        ScrollTrigger.create({ start: 80, end: 'max', toggleClass: { targets: '.nav', className: 'scrolled' } });
      }),
    );
  }
}
