import { Tone } from '../../core/miplante.models';
import type { TillSection } from '../../core/navigation-intent';

export type TabName = TillSection;
export const TABS: readonly TabName[] = [
  'inicio',
  'vender',
  'efectivo',
  'metas',
  'repartos',
  'ajustes',
  'avisos',
];

export interface BannerMessage {
  text: string;
  tone: Tone;
}
