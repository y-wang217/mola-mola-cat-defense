/**
 * Status effects: a generic, stacking system on the enemy entity.
 *
 * Never special-case a status kind outside this file. A status tower is a row
 * in towers.ts that names a kind, a magnitude and a duration; everything about
 * how that lands is decided here, once.
 *
 * Stacking is where TD balance goes to die, so every kind gets exactly one
 * documented rule and no exceptions. See STACK_RULES below.
 */

export type StatusKind =
  | "slow"
  | "poison"
  | "vulnerable"
  | "armor_shred"
  | "mark"
  | "stun";

export type StatusEffect = {
  kind: StatusKind;
  /** Meaning is per-kind; see STACK_RULES. Always an integer. */
  magnitude: number;
  remainingTicks: number;
  /** Which tower applied it. Kept for debugging and future attribution. */
  sourceId: string;
};

/**
 * How a second application of the same kind combines with the first.
 *
 * - `max`      — keep the larger magnitude, refresh duration to the longer.
 * - `additive` — sum magnitudes, duration becomes the longer of the two.
 * - `refresh`  — magnitude unchanged, duration only ever extends.
 */
export type StackRule = "max" | "additive" | "refresh";

/**
 * The one place stacking is decided.
 *
 * slow        — `max`. Additive slows multiply into a permanent freeze, which
 *               makes two status towers strictly better than any composition.
 * poison      — `additive`. Poison ignores armour and is the armoured answer;
 *               stacking is the reward for committing to it.
 * vulnerable  — `max`. Additive damage multipliers explode combinatorially.
 * armor_shred — `additive`, clamped to base armour at application time so it
 *               can strip armour but never invert it into bonus damage.
 * mark        — `max`. A flag, not a quantity.
 * stun        — `refresh`. Stacking magnitude on a full stop is meaningless,
 *               and chaining stuns is prevented by per-tower cooldown instead.
 */
export const STACK_RULES: Record<StatusKind, StackRule> = {
  slow: "max",
  poison: "additive",
  vulnerable: "max",
  armor_shred: "additive",
  mark: "max",
  stun: "refresh",
};

/** Deterministic ordering for the status array — never rely on insertion order. */
const KIND_ORDER: StatusKind[] = [
  "slow",
  "poison",
  "vulnerable",
  "armor_shred",
  "mark",
  "stun",
];

export function kindRank(kind: StatusKind): number {
  return KIND_ORDER.indexOf(kind);
}

/**
 * Apply `incoming` to `statuses`, mutating it in place and keeping it sorted by
 * kind. The caller owns `statuses` (it belongs to a cloned state).
 *
 * `armorCap` clamps armor_shred so it cannot exceed the target's base armour.
 */
export function applyStatus(
  statuses: StatusEffect[],
  incoming: StatusEffect,
  armorCap: number,
): void {
  const existing = statuses.find((s) => s.kind === incoming.kind);

  if (!existing) {
    const added = { ...incoming };
    if (added.kind === "armor_shred") added.magnitude = Math.min(added.magnitude, armorCap);
    statuses.push(added);
    statuses.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
    return;
  }

  switch (STACK_RULES[incoming.kind]) {
    case "max":
      existing.magnitude = Math.max(existing.magnitude, incoming.magnitude);
      existing.remainingTicks = Math.max(existing.remainingTicks, incoming.remainingTicks);
      break;
    case "additive":
      existing.magnitude += incoming.magnitude;
      if (existing.kind === "armor_shred") {
        existing.magnitude = Math.min(existing.magnitude, armorCap);
      }
      existing.remainingTicks = Math.max(existing.remainingTicks, incoming.remainingTicks);
      break;
    case "refresh":
      existing.remainingTicks = Math.max(existing.remainingTicks, incoming.remainingTicks);
      break;
  }
  existing.sourceId = incoming.sourceId;
}

/** Decrement durations and drop expired effects. Returns the surviving array. */
export function expireStatuses(statuses: StatusEffect[]): StatusEffect[] {
  for (const s of statuses) s.remainingTicks -= 1;
  return statuses.filter((s) => s.remainingTicks > 0);
}

export function magnitudeOf(statuses: StatusEffect[], kind: StatusKind): number {
  const found = statuses.find((s) => s.kind === kind);
  return found ? found.magnitude : 0;
}

export function hasStatus(statuses: StatusEffect[], kind: StatusKind): boolean {
  return statuses.some((s) => s.kind === kind);
}
