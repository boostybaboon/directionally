import type { GeometryType } from '../geometry/types';
import type { MaterialType } from '../material/types';
import type { JSONObject } from '../types';

export type MeshData = {
  geometryType: GeometryType;
  geometry: JSONObject;
  materialType: MaterialType;
  material: JSONObject;
  position: [number, number, number];
  //TODO - don't use euler angles
  rotation: [number, number, number];
} 