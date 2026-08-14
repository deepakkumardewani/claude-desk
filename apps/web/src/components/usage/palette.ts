/**
 * Shared teal-forward accent ramp for usage cost charts (ShareBar segments,
 * timeline bars). Fixed hex values stay stable across light/dark themes so
 * segments remain distinguishable. Avoids purple AI-slop accents.
 */
export const COST_RAMP = [
  "#0f766e", // teal-700
  "#0d9488", // teal-600
  "#14b8a6", // teal-500
  "#2dd4bf", // teal-400
  "#5eead4", // teal-300
  "#99f6e4", // teal-200
] as const;
