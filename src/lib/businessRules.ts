import sql from "@/lib/db"

/**
 * Centralized scoring and telemetry logic.
 * All score calculations must go through this class.
 *
 * Current formula:
 *   score = total_fist_bumps_received + (PR_POINTS × total_prs)
 */
export class BusinessRules {
  static readonly PR_POINTS = 50

  /** Get a single user's score. */
  static async getScore(userId: number): Promise<number> {
    const b = await this.getScoreBreakdown(userId)
    return b.score
  }

  /** Score breakdown for display. */
  static async getScoreBreakdown(userId: number) {
    const [row] = await sql`
      SELECT
        COALESCE((
          SELECT COUNT(*)::int FROM fist_bumps fb
          JOIN workout_results wr ON wr.id = fb.result_id
          WHERE wr.user_id = ${userId}
        ), 0) AS total_bumps,
        COALESCE((
          SELECT COUNT(*)::int FROM workout_results
          WHERE user_id = ${userId} AND is_pr = TRUE
        ), 0) AS total_prs
    `
    const totalBumps = row.total_bumps as number
    const totalPrs = row.total_prs as number
    return {
      totalBumps,
      totalPrs,
      score: totalBumps + this.PR_POINTS * totalPrs,
    }
  }

  /** Batch-fetch scores for multiple users (friends list, leaderboard). */
  static async getScores(userIds: number[]): Promise<Record<number, number>> {
    if (userIds.length === 0) return {}
    const rows = await sql`
      SELECT
        u.id AS user_id,
        COALESCE(bumps.cnt, 0)::int AS total_bumps,
        COALESCE(prs.cnt, 0)::int AS total_prs
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt FROM fist_bumps fb
        JOIN workout_results wr ON wr.id = fb.result_id
        WHERE wr.user_id = u.id
      ) bumps ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt FROM workout_results
        WHERE user_id = u.id AND is_pr = TRUE
      ) prs ON TRUE
      WHERE u.id = ANY(${userIds})
    `
    const result: Record<number, number> = {}
    for (const r of rows) {
      result[r.user_id] = (r.total_bumps as number) + this.PR_POINTS * (r.total_prs as number)
    }
    return result
  }
}
