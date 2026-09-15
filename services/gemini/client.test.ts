/**
 * Unit-Tests: geminiRequest (services/gemini/client.ts)
 *
 * Prüft das tägliche Anfragelimit pro User (DAILY_REQUEST_LIMIT).
 */

jest.mock("@/services/supabaseClient");

import { supabase } from "@/services/supabaseClient";
import { GeminiCostLimitError, GeminiDailyLimitError, geminiRequest } from "./client";

const GEMINI_RESPONSE = {
  candidates: [{ content: { parts: [{ text: "ok" }] } }],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
};

/**
 * Baut die ai_logs-Mock-Chain nach: select().eq().gte() für Tageslimit (count)
 * UND Kosten-Deckel (rows), insert() fürs Logging. Eine echte Supabase-Antwort
 * trägt immer beide Felder (count nur befüllt bei { count: 'exact' }), daher
 * liefert der Mock hier ebenfalls beide.
 */
function mockAiLogsTable(count: number | null, error: unknown = null, rows: { cost_usd: number }[] = []) {
  const gte = jest.fn().mockResolvedValue({ count, error, data: error ? null : rows });
  const eq = jest.fn().mockReturnValue({ gte });
  const select = jest.fn().mockReturnValue({ eq });
  const insert = jest.fn().mockResolvedValue({ error: null });
  return { select, insert };
}

/** profiles.select('is_premium').eq('id', …).maybeSingle() */
function mockProfilesTable(isPremium: boolean) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { is_premium: isPremium }, error: null });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select };
}

/** Router für supabase.from(): ai_logs + profiles + Fallback fürs Logging. */
function mockFrom(opts: {
  aiLogsCount?: number | null;
  aiLogsError?: unknown;
  aiLogsRows?: { cost_usd: number }[];
  isPremium?: boolean;
}) {
  return (table: string) => {
    if (table === "ai_logs") {
      return mockAiLogsTable(opts.aiLogsCount ?? 0, opts.aiLogsError ?? null, opts.aiLogsRows ?? []);
    }
    if (table === "profiles") return mockProfilesTable(opts.isPremium ?? false);
    return { insert: jest.fn().mockResolvedValue({ error: null }) };
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  process.env.EXPO_PUBLIC_GEMINI_API_KEY = "test-key";

  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "user-123" } },
  });

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => GEMINI_RESPONSE,
  }) as unknown as typeof fetch;
});

describe("Tageslimit", () => {
  it("wirft GeminiDailyLimitError wenn der User bereits 10 Anfragen heute hat", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "ai_logs"
        ? mockAiLogsTable(10)
        : { insert: jest.fn().mockResolvedValue({ error: null }) },
    );

    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(
      GeminiDailyLimitError,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lässt die Anfrage durch wenn der User unter dem Limit ist", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "ai_logs"
        ? mockAiLogsTable(9)
        : { insert: jest.fn().mockResolvedValue({ error: null }) },
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("überspringt die Prüfung wenn kein User eingeloggt ist", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
    });
    (supabase.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("lässt die Anfrage durch für den Test-Account av@test.de ohne Tageslimit", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-test", email: "av@test.de" } },
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "ai_logs"
        ? mockAiLogsTable(9999)
        : { insert: jest.fn().mockResolvedValue({ error: null }) },
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("Premium-Abonnenten unterliegen nicht dem täglichen Anfragelimit (nur dem Kosten-Deckel)", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-premium", email: "premium@example.com" } },
    });
    (supabase.from as jest.Mock).mockImplementation(mockFrom({ aiLogsCount: 9999, isPremium: true }));

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("wendet das Limit auf Nicht-Premium-User an (profiles.is_premium = false)", async () => {
    (supabase.from as jest.Mock).mockImplementation(mockFrom({ aiLogsCount: 10, isPremium: false }));

    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(GeminiDailyLimitError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lässt die Anfrage durch wenn die Limit-Abfrage selbst fehlschlägt (fail open)", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "ai_logs"
        ? mockAiLogsTable(null, { message: "DB-Fehler" })
        : { insert: jest.fn().mockResolvedValue({ error: null }) },
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Monatliches Kostenlimit (Premium)", () => {
  beforeEach(() => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-premium", email: "premium@example.com" } },
    });
  });

  it("wirft GeminiCostLimitError wenn diesen Monat bereits ≥10 $ an Kosten angefallen sind", async () => {
    (supabase.from as jest.Mock).mockImplementation(
      mockFrom({ isPremium: true, aiLogsRows: [{ cost_usd: 6 }, { cost_usd: 4 }] }),
    );

    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(GeminiCostLimitError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lässt die Anfrage durch wenn die bisherigen Kosten unter dem Limit liegen", async () => {
    (supabase.from as jest.Mock).mockImplementation(
      mockFrom({ isPremium: true, aiLogsRows: [{ cost_usd: 3 }, { cost_usd: 2.5 }] }),
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("betrifft nur Premium-User, nicht kostenlose Accounts", async () => {
    (supabase.from as jest.Mock).mockImplementation(
      mockFrom({ isPremium: false, aiLogsCount: 0, aiLogsRows: [{ cost_usd: 999 }] }),
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("lässt die Anfrage durch wenn die Kosten-Abfrage selbst fehlschlägt (fail open)", async () => {
    (supabase.from as jest.Mock).mockImplementation(
      mockFrom({ isPremium: true, aiLogsError: { message: "DB-Fehler" } }),
    );

    const result = await geminiRequest([{ text: "hi" }]);
    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("speichert die geschätzten USD-Kosten der Anfrage in ai_logs.cost_usd", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "ai_logs"
        ? { ...mockAiLogsTable(0), insert }
        : mockFrom({ isPremium: true })(table),
    );

    // GEMINI_RESPONSE: 1 Prompt-Token, 1 Completion-Token.
    // (1/1e6)*0.30 + (1/1e6)*2.50 = 0.0000028
    await geminiRequest([{ text: "hi" }]);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ cost_usd: expect.closeTo(0.0000028, 10) }),
    );
  });
});
