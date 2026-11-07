import type { PublicPoi, PublicSearchResult } from './types';
import { floorLabel, type VenueState } from './venue';

export type StoreCategory =
  | 'fashion'
  | 'coffee'
  | 'books'
  | 'food'
  | 'wc_male'
  | 'wc_female'
  | 'elevator'
  | 'escalator'
  | 'atm'
  | 'electronics'
  | 'beauty'
  | 'supermarket'
  | 'pharmacy'
  | 'exit'
  | 'rest';

/** Icon to draw for a POI, or null for a plain dot (generic "CUSTOM" points). */
export function poiIcon(poi: Pick<PublicPoi, 'category' | 'name'>): StoreCategory | null {
  const cat = poi.category.toUpperCase();
  const name = poi.name.toLowerCase();
  if (cat === 'RESTROOM' || cat === 'TOILET' || /vệ sinh|toilet|\bwc\b/.test(name)) return 'wc_male';
  if (cat === 'ELEVATOR' || /thang m[áa]y/.test(name)) return 'elevator';
  if (cat === 'ESCALATOR' || /thang cuốn/.test(name)) return 'escalator';
  if (cat === 'EXIT' || /thoát|thang b[ộo]/.test(name)) return 'exit';
  if (cat === 'ATM' || /\batm\b/.test(name)) return 'atm';
  return null;
}

export type PlaceCategory = StoreCategory | 'poi';

/** A destination the user can pick (a store or a POI), with its floor and a display category. */
export type Place = {
  id: string;
  name: string;
  floorId: string;
  /** Floor number as shown to the user. */
  floor: string;
  nodeId: string;
  category: PlaceCategory;
};

export function placesOf(venue: Pick<VenueState, 'destinations' | 'mapsByFloorId'>): Place[] {
  return venue.destinations.map((d: PublicSearchResult) => {
    const poi = venue.mapsByFloorId[d.floorId]?.pois.find((p) => p.id === d.id);
    return {
      id: d.id,
      name: d.name,
      floorId: d.floorId,
      floor: floorLabel(d.floorId),
      nodeId: d.nodeId,
      category: (poi && poiIcon(poi)) ?? 'poi',
    };
  });
}
