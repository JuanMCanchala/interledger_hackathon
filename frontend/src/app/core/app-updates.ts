/**
 * Keeps an open tab working across deploys. Every build renames its lazy chunks, so a tab still
 * running the previous build asks for files the server no longer has. A page that fails to load
 * that way is opened again once the new build is in place, and a new version waiting in the
 * service worker is taken on the next navigation, as a full page load, never in the middle of a sale.
 */

import { inject, provideEnvironmentInitializer } from '@angular/core';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

const RELOADED_KEY = 'miplante:reloaded-for';

/** The browser's error when a lazy chunk of another build is gone (Chrome, Firefox, Safari). */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    message,
  );
}

/** Marks `url` as reloaded; false if it already was, so a second failure is not a reload loop. */
function firstReloadOf(url: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === url) return false;
    sessionStorage.setItem(RELOADED_KEY, url);
    return true;
  } catch {
    // Without storage there is no loop guard, and a reload loop is worse than the error.
    return false;
  }
}

function forgetReload(): void {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // Nothing to forget.
  }
}

export function provideAppUpdates() {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    const updates = inject(SwUpdate);
    let versionReady = false;

    /** Lets the service worker fetch the new build first, or the reload gets the old one again. */
    const reload = async (url: string) => {
      if (updates.isEnabled) await updates.checkForUpdate().catch(() => false);
      window.location.assign(url);
    };

    router.events.subscribe((event) => {
      if (event instanceof NavigationError && isStaleChunkError(event.error)) {
        if (firstReloadOf(event.url)) void reload(event.url);
      } else if (
        event instanceof NavigationStart &&
        versionReady &&
        event.navigationTrigger === 'imperative'
      ) {
        versionReady = false;
        window.location.assign(event.url);
      } else if (event instanceof NavigationEnd) {
        forgetReload();
      }
    });

    if (!updates.isEnabled) return;
    updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') versionReady = true;
    });
    updates.unrecoverable.subscribe(() => window.location.reload());
  });
}
