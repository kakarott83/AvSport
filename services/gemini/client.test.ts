/**
 * Unit-Tests: geminiRequest (services/gemini/client.ts)
 *
 * Prüft das tägliche Anfragelimit pro User (DAILY_REQUEST_LIMIT).
 */

jest.mock("@/services/supabaseClient");

import { supabase } from "@/services/supabaseClient";
import { GeminiDailyLimitError, geminiRequest } from "./client";

const GEMINI_RESPONSE = {
  candidates: [{ content: { parts: [{ text: "ok" }] } }],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
};

/** Baut die ai_logs-Mock-Chain nach: select().eq().gte() für den Limit-Check, insert() fürs Logging. */
function mockAiLogsTable(count: number | null, error: unknown = null) {
  const gte = jest.fn().mockResolvedValue({ count, error });
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
function mockFrom(opts: { aiLogsCount?: number | null; aiLogsError?: unknown; isPremium?: boolean }) {
  return (table: string) => {
    if (table === "ai_logs") return mockAiLogsTable(opts.aiLogsCount ?? 0, opts.aiLogsError ?? null);
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

  it("überspringt das Tageslimit für Premium-Abonnenten", async () => {
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
