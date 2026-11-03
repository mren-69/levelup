import { RECOVERY_POOL } from './recovery-pool.js';

/** 逃した経験値が20未満なら2割、20以上なら1割(四捨五入・最低1) */
export function recoveryXp(missedXp) {
  const rate = missedXp < 20 ? 0.2 : 0.1;
  return Math.max(1, Math.round(missedXp * rate));
}

/** 候補から完全ランダムに1つ(添字)。連続して同じものが出てもよい */
export function pickTask(rand = Math.random) {
  return Math.min(RECOVERY_POOL.length - 1, Math.floor(rand() * RECOVERY_POOL.length));
}

export function taskText(index) {
  return RECOVERY_POOL[index] ?? RECOVERY_POOL[0];
}
