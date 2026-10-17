import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MOTION, animate, scrollToSection, ScrollSmoother } from '../../core/motion';
import { Cursor } from '../../shared/ui/cursor';
import { Loader } from './loader/loader';
import { Nav } from './nav/nav';
import { Closing } from './sections/closing/closing';
import { Features } from './sections/features/features';
import { Hero } from './sections/hero/hero';
import { Preview } from './sections/preview/preview';
import { Purpose } from './sections/purpose/purpose';
import { Story } from './sections/story/story';

@Component({
  selector: 'app-landing',
  imports: [Loader, Cursor, Nav, Hero, Purpose, Story, Features, Preview, Closing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'followHashLink($event)' },
  templateUrl: './landing.html',
})
export default class Landing implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  protected readonly revealed = signal(false);

  constructor() {
    animate((mm) =>
      mm.add(MOTION, () => {
        const smoother = ScrollSmoother.create({
          wrapper: '#smooth-wrapper',
          content: '#smooth-content',
          smooth: 1.1,
          effects: true,
          smoothTouch: false,
        });
        return () => smoother.kill();
      }),
    );
  }

  ngOnInit(): void {
    this.title.setTitle("MiPlante: tus finanzas pa' lante");
    const params = this.route.snapshot.queryParams;
    if (params['payment'] || params['mandate']) {
      this.router.navigate(['/sandbox'], { queryParams: params, replaceUrl: true });
    }
  }

  protected followHashLink(event: MouseEvent): void {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    scrollToSection(link.hash);
    history.replaceState(null, '', link.hash);
  }
}
