/** CSS hex colour palette for actor timeline strips and emissive tints. */
export const ACTOR_COLORS = ['#4a9eff', '#ff7a5c', '#56b87a', '#c07fff', '#ffd060', '#60d0ff'];

export function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
