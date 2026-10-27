/**
 * Reciprocal Rank Fusion (RRF) scoring.
 *
 * Classic formula (Cormack et al. 2009):
 *   score(d) = Σ  1 / (k + rank_i(d))
 *   where rank_i is 1-based rank in list i, k=60 by default.
 *
 * Exact-match bonus: items in the exactIds set receive an additional +1.0,
 * ensuring they always rank above pure FTS / vector results.
 */

export const RRF_K = 60;

export interface RrfItem {
  id: string;
  score: number;
  matchedBy: Array<"exact" | "fts" | "vector">;
}

/**
 * Fuse any number of ranked lists into a single ranked list.
 *
 * @param exactIds  Set of IDs that are exact-identifier matches (phone, email, external_ref).
 *                  These receive an additional +1.0 score boost independent of rank.
 * @param lists     Named ranked lists: [name, ranked-id-array][].
 *                  Each inner array is ordered best-first (rank 1 = index 0).
 * @param k         RRF constant. Defaults to RRF_K (60).
 */
export function reciprocalRankFusion(
  exactIds: ReadonlySet<string>,
  lists: Array<["exact" | "fts" | "vector", string[]]>,
  k = RRF_K,
): RrfItem[] {
  const scores = new Map<string, number>();
  const sources = new Map<string, Set<"exact" | "fts" | "vector">>();

  for (const [name, ranked] of lists) {
    for (let i = 0; i < ranked.length; i++) {
      const id = ranked[i]!;
      scores.set(id, (scores.get(id) ?? 0) + 1.0 / (k + i + 1));
      if (!sources.has(id)) sources.set(id, new Set());
      sources.get(id)!.add(name);
    }
  }

  // Apply exact-match boost AFTER RRF so the boost is additive, not part of
  // the reciprocal-rank sum. A boost of 1.0 exceeds the maximum possible RRF
  // score from any finite ranked list, guaranteeing exact results sort first.
  for (const id of exactIds) {
    scores.set(id, (scores.get(id) ?? 0) + 1.0);
    if (!sources.has(id)) sources.set(id, new Set());
    sources.get(id)!.add("exact");
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({
      id,
      score,
      matchedBy: Array.from(sources.get(id) ?? []) as Array<"exact" | "fts" | "vector">,
    }))
    .sort((a, b) => b.score - a.score);
}
