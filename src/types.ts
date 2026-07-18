/** Shared data types for the voxel Seoul portfolio. */

export type DistrictId =
  | 'plaza'
  | 'hongdae'
  | 'gangnam'
  | 'hanok'
  | 'riverside'
  | 'namsan';

export type BuildingType =
  | 'arcade'
  | 'creative-studio'
  | 'tech-lab'
  | 'glass-store'
  | 'server-facility'
  | 'office-tower'
  | 'workshop'
  | 'hanok-house'
  | 'subway-station'
  | 'phone-booth';

export interface Vec2 {
  x: number;
  z: number;
}

/** Which side of the building footprint the door sits on. */
export type Facing = 'north' | 'south' | 'east' | 'west';

export interface ProjectData {
  id: string;
  title: string;
  koreanTitle: string;
  shortDescription: string;
  longDescription: string;
  role: string;
  technologies: string[];
  year: string;
  challenge: string;
  outcome: string;
  /** Placeholder images are generated at runtime; alt text comes from here. */
  images: { alt: string }[];
  liveUrl?: string;
  repositoryUrl?: string;
  buildingType: BuildingType;
  district: DistrictId;
  position: Vec2;
  /** Y rotation of the building in radians. */
  rotation: number;
  facing: Facing;
  /** Accent color hex used for neon, sign, and panel theming. */
  accent: string;
  /** Building footprint, used for both geometry and physics. */
  size: { width: number; depth: number; floors: number };
}

export type PlaceKind =
  | 'about'
  | 'skills'
  | 'experience'
  | 'contact'
  | 'links';

export interface PlaceData {
  id: string;
  kind: PlaceKind;
  title: string;
  koreanTitle: string;
  tagline: string;
  buildingType: BuildingType;
  district: DistrictId;
  position: Vec2;
  rotation: number;
  facing: Facing;
  accent: string;
  size: { width: number; depth: number; floors: number };
}

export interface InteractionTarget {
  id: string;
  kind: 'project' | 'place';
  title: string;
  koreanTitle: string;
  accent: string;
  /** World position of the entrance trigger. */
  entrance: { x: number; y: number; z: number };
  /** Direction the camera should look from when presenting (unit XZ). */
  approach: { x: number; z: number };
  radius: number;
  project?: ProjectData;
  place?: PlaceData;
}

export interface DistrictInfo {
  id: DistrictId;
  name: string;
  koreanName: string;
  /** Axis-aligned bounds for detection. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type QualityLevel = 'low' | 'medium' | 'high';
