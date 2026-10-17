import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing') },
  {
    path: 'login',
    data: { mode: 'login' },
    loadComponent: () => import('./features/auth/auth'),
  },
  {
    path: 'register',
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth'),
  },
  {
    path: 'onboard',
    loadComponent: () => import('./features/onboard/onboard'),
  },
  {
    path: 'merchant',
    loadComponent: () => import('./features/merchant/merchant'),
  },
  {
    path: 'pay',
    loadComponent: () => import('./features/pay/pay'),
  },
  {
    path: 'cobro',
    loadComponent: () => import('./features/cobro/cobro'),
  },
  {
    path: 'sandbox',
    loadComponent: () => import('./features/sandbox/sandbox'),
  },
  // Support legacy .html URLs in SPA router as well
  { path: 'login.html', redirectTo: 'login' },
  { path: 'register.html', redirectTo: 'register' },
  { path: 'onboard.html', redirectTo: 'onboard' },
  { path: 'merchant.html', redirectTo: 'merchant' },
  { path: 'pay.html', redirectTo: 'pay' },
  { path: 'cobro.html', redirectTo: 'cobro' },
  { path: 'sandbox.html', redirectTo: 'sandbox' },
  { path: '**', redirectTo: '' },
];
