import { getAuthErrorMessage } from "./authErrors";

describe("getAuthErrorMessage", () => {
  it("returns a clear network error for fetch failures", () => {
    expect(getAuthErrorMessage("Network request failed")).toBe(
      "Keine Internetverbindung oder Supabase ist derzeit nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.",
    );
  });

  it("returns a clear network error for failed to fetch", () => {
    expect(getAuthErrorMessage("fetch failed")).toBe(
      "Keine Internetverbindung oder Supabase ist derzeit nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.",
    );
  });

  it("returns the original message for auth errors", () => {
    expect(getAuthErrorMessage("Invalid login credentials")).toBe(
      "Invalid login credentials",
    );
  });
});
