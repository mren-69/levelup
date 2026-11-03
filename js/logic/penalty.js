/** 倍率の段階: 0=通常, 1=×1.25, 2=×1.5(上限) */
export const MULTS = [1, 1.25, 1.5];
export const MAX_STAGE = MULTS.length - 1;

/** ペナルティ込みの必要量。四捨五入し、増えるときは最低でも+1 */
export function requiredAmount(base, stage) {
  if (!stage) return base;
  return Math.max(base + 1, Math.round(base * MULTS[stage]));
}
