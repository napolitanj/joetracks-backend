import { RESORTS, type Resort } from '../../data/michiganResorts';

export type Region =
  | 'Western UP'
  | 'Eastern UP'
  | 'Northern LP'
  | 'Southern LP';

export function getResortsByRegion(region: Region): Resort[] {
  return RESORTS.filter((r) => r.region === region);
}
