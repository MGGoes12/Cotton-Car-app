/** Calendar background Shrek per month (0 = January). December is always Christmas Shrek. */
export const SHREK_BY_MONTH: readonly string[] = [
  'assets/shrek-months/shrek-tpose.png',
  'assets/shrek-months/shrek-thinking.png',
  'assets/shrek-months/shrek-jump.png',
  'assets/shrek-months/shrek-shrug.png',
  'assets/shrek-months/shrek-classic.png',
  'assets/shrek-months/shrek-standing.png',
  'assets/shrek-months/shrek-thinking.png',
  'assets/shrek-months/shrek-jump.png',
  'assets/shrek-months/shrek-shrug.png',
  'assets/shrek-months/shrek-classic.png',
  'assets/shrek-months/shrek-tpose.png',
  'assets/shrek-months/shrek-december.png'
];

export function shrekForMonth(monthIndex: number): string {
  const i = Math.max(0, Math.min(11, monthIndex));
  return SHREK_BY_MONTH[i];
}
