/**
 * Unit-Tests: geminiRequest (services/gemini/client.ts)
 *
 * Die Limits selbst prüft der Server (supabase/functions/ai-proxy +
 * public.ai_quota_status); hier wird geprüft, dass der Client den Proxy
 * korrekt aufruft und dessen Limit-Antworten in die passenden Fehler übersetzt.
 */

jest.mock("@/services/supabaseClient");

import { supabase } from "@/services/supabaseClient";
import {
  GeminiAccessBlockedError,
  GeminiCostLimitError,
  GeminiDailyLimitError,
  GeminiMonthlyLimitError,
  geminiRequest,
} from "./client";

function mockProxyResponse(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { access_token: "user-jwt" } },
  });
});

describe("Aufruf des ai-proxy", () => {
  it("schickt parts, feature und das User-JWT an die Edge Function", async () => {
    mockProxyResponse(200, { ok: true, text: "ok" });

    const result = await geminiRequest([{ text: "hi" }], "food_text");

    expect(result).toBe("ok");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/ai-proxy",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer user-jwt", apikey: "anon-key" }),
        body: JSON.stringify({ parts: [{ text: "hi" }], feature: "food_text" }),
      }),
    );
  });

  it("entfernt Markdown-Codeblöcke aus der Antwort", async () => {
    mockProxyResponse(200, { ok: true, text: '```json\n{"a":1}\n```' });
    await expect(geminiRequest([{ text: "hi" }])).resolves.toBe('{"a":1}');
  });

  it("verlangt einen Login, ohne den Proxy aufzurufen", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(/melde dich an/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("wirft bei Serverfehlern die Fehlermeldung des Proxys", async () => {
    mockProxyResponse(502, { error: "KI-Anfrage fehlgeschlagen.", code: "upstream_error" });
    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow("KI-Anfrage fehlgeschlagen.");
  });
});

describe("Limit-Antworten des Servers", () => {
  it("daily_limit → GeminiDailyLimitError mit dem Limit vom Server", async () => {
    mockProxyResponse(429, { code: "daily_limit", quota: { daily_limit: 5 } });
    const err = await geminiRequest([{ text: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiDailyLimitError);
    expect(err.message).toContain("5 KI-Anfragen");
  });

  it("monthly_limit → GeminiMonthlyLimitError", async () => {
    mockProxyResponse(429, { code: "monthly_limit", quota: { monthly_limit: 100 } });
    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(GeminiMonthlyLimitError);
  });

  it("monthly_cost_cap → GeminiCostLimitError", async () => {
    mockProxyResponse(429, { code: "monthly_cost_cap" });
    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(GeminiCostLimitError);
  });

  it("blocked → GeminiAccessBlockedError", async () => {
    mockProxyResponse(403, { code: "blocked" });
    await expect(geminiRequest([{ text: "hi" }])).rejects.toThrow(GeminiAccessBlockedError);
  });
});
