import { Tone } from '../../core/miplante.models';

export type TabName = 'inicio' | 'vender' | 'efectivo' | 'metas' | 'repartos' | 'ajustes' | 'avisos';
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
