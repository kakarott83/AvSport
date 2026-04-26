import { HealthManager } from "@/lib/healthManager";
import { supabase } from "@/services/supabaseClient";

/**
 * High-level orchestrator: reads profiles.sync_health, fetches today's data
 * from HealthManager, and upserts into daily_logs — all in one call.
 *
 * Safe to call at any time: returns early if sync is disabled or the user
 * is not authenticated. Never throws.
 */
export async function syncHealthToSupabase(): Promise<void> {
  // Guard: native HC bridge not yet attached — skip silently.
  // The next useFocusEffect or manual sync will retry once init() completes.
  if (!HealthManager.isReady()) {
    if (__DEV__) console.log("[healthSync] skipped — HealthManager not ready yet.");
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check consent flag before any native call
    const { data: profile } = await supabase
      .from("profiles")
      .select("sync_health")
      .eq("id", user.id)
      .single();

    if (!profile?.sync_health) return;

    const today     = new Date();
    const startTime = new Date(today).setHours(0, 0, 0, 0);

    const { steps, calories } = await HealthManager.fetchStepsAndCalories({
      startTime: new Date(startTime).toISOString(),
      endTime:   today.toISOString(),
    });

    const date = today.toISOString().split("T")[0]; // "YYYY-MM-DD"

    const { error } = await supabase
      .from("daily_logs")
      .upsert(
        { user_id: user.id, date, steps, calories_active: calories },
        { onConflict: "user_id,date" },
      );

    if (error) throw error;

    if (__DEV__) console.log(`[healthSync] synced — ${date}: ${steps} steps, ${calories} kcal`);
  } catch (e) {
    console.error("[healthSync] syncHealthToSupabase failed:", e);
  }
}

/**
 * Persists today's Health Connect step count in the `daily_logs` table.
 *
 * Uses upsert so multiple calls throughout the day simply overwrite the
 * previous value — no duplicate rows accumulate.
 *
 * Prerequisite: the `daily_logs` table must have a `steps` integer column
 * and a unique constraint on (user_id, date).  If the column is missing,
 * run this migration in Supabase:
 *
 *   ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS steps integer DEFAULT 0;
 *   ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS calories_active integer DEFAULT 0;
 *
 * Returns the upserted row's date on success, null on failure.
 */
export async function syncStepsToSupabase(
  userId: string,
  steps: number,
  caloriesActive: number = 0,
): Promise<string | null> {
  if (!userId || steps < 0) return null;

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const { data, error } = await supabase
    .from("daily_logs")
    .upsert(
      {
        user_id:         userId,
        date:            today,
        steps,
        calories_active: caloriesActive,
      },
      { onConflict: "user_id,date" },
    )
    .select("date")
    .single();

  if (error) {
    console.error("[healthSync] syncStepsToSupabase failed:", error.message);
    return null;
  }

  if (__DEV__) {
    console.log(`[healthSync] persisted — date: ${data.date}, steps: ${steps}, burned: ${caloriesActive} kcal`);
  }

  return data.date;
}

/**
 * Reads back today's persisted step count from Supabase.
 * Returns 0 when no row exists yet.
 */
export async function loadTodaySteps(userId: string): Promise<number> {
  if (!userId) return 0;

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_logs")
    .select("steps")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (error) {
    console.error("[healthSync] loadTodaySteps failed:", error.message);
    return 0;
  }

  return (data as any)?.steps ?? 0;
}
