/**
 * Enemies, written before the towers.
 *
 * Every archetype here exists to make one tower family mandatory. If an
 * archetype can be answered equally well by any family, it is not pulling its
 * weight and should be redesigned or deleted rather than kept for variety.
 *
 *   runner   -> melee block, or slow. Too fast to kill with range alone.
 *   armoured -> armor_shred / poison / slow-and-heavy. Punishes fast-and-weak.
 *   swarm    -> splash or pierce. Drowns single-target and drains blocker HP.
 *   flier    -> projectile only. Unblockable by design.
 *   brute    -> vulnerable + sustained damage. Kills a lone blocker outright.
 *   boss     -> heavy armour and a huge pool: needs shred/vulnerable AND
 *               sustained projectile damage. One family cannot do it.
 */

export type EnemyKind = "runner" | "armoured" | "swarm" | "flier" | "brute" | "boss";

export type EnemySpec = {
  /**
   * PRE-ART PLACEHOLDER, same caveat as the tower icons: emoji stand in for
   * real art so the player can name what is attacking them without a tooltip.
   * The flier in particular has to be unmistakable — it is the lever that makes
   * projectile towers mandatory, and if the player cannot see that something
   * flies, the lesson never lands.
   */
  icon: string;
  /** Trash tier renders without an HP bar; the bar would be noise at this size. */
  trash: boolean;
  hp: number;
  /** Fixed-point units per tick at 30Hz. TILE is 1000. */
  speed: number;
  /** Flat reduction per hit, before armor_shred. */
  armor: number;
  /** Damage dealt to a blocking melee tower per attack. */
  blockDamage: number;
  /** Ticks between attacks on a blocker. */
  attackCooldown: number;
  /** Lives lost if it reaches the end. */
  leak: number;
  /** Fliers ignore blockers entirely — they still follow the lane. */
  flying: boolean;
  score: number;
  /** Render radius, fixed-point. */
  radius: number;
};

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  // Fast and fragile. At this speed a purely ranged board simply does not get
  // enough shots off before it is past — a blocker buying time-in-range is the
  // answer, and that is the whole reason the melee family exists.
  runner: {
    icon: "🏃", trash: false,
    hp: 95, speed: 148, armor: 0, blockDamage: 4, attackCooldown: 20,
    leak: 1, flying: false, score: 10, radius: 165,
  },

  // Armour 30 floors every fast tower and badly blunts the heavy ones. Shred it,
  // poison it (poison ignores armour), or hit it with something heavy.
  armoured: {
    icon: "🪖", trash: false,
    hp: 185, speed: 45, armor: 30, blockDamage: 8, attackCooldown: 24,
    leak: 1, flying: false, score: 15, radius: 200,
  },

  // Individually trivial; the threat is count. Chews through blocker HP.
  swarm: {
    icon: "🐜", trash: true,
    hp: 30, speed: 68, armor: 0, blockDamage: 3, attackCooldown: 18,
    leak: 1, flying: false, score: 6, radius: 130,
  },

  // Follows the lane but cannot be blocked or engaged. Melee is irrelevant.
  flier: {
    icon: "🦇", trash: false,
    hp: 105, speed: 84, armor: 4, blockDamage: 0, attackCooldown: 0,
    leak: 1, flying: true, score: 14, radius: 175,
  },

  // Slow enough to shoot, but blockDamage 26 deletes a lone tier-1 blocker.
  brute: {
    icon: "🦍", trash: false,
    hp: 460, speed: 30, armor: 16, blockDamage: 30, attackCooldown: 30,
    leak: 2, flying: false, score: 40, radius: 265,
  },

  // Wave 6. Armour 14 blunts raw projectile damage and the pool is too large
  // for status alone to whittle: it requires both families working together.
  boss: {
    icon: "👹", trash: false,
    hp: 3000, speed: 24, armor: 70, blockDamage: 50, attackCooldown: 26,
    leak: 6, flying: false, score: 250, radius: 340,
  },
};

/** Effective damage after armour and armor_shred, with a floor of 1. */
export function effectiveDamage(raw: number, armor: number, shred: number): number {
  return Math.max(1, raw - Math.max(0, armor - shred));
}
