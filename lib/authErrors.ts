export function getAuthErrorMessage(errorMessage?: string | null): string {
  const message = (errorMessage ?? "").trim();

  if (!message) {
    return "Ein unbekannter Fehler ist aufgetreten. Bitte versuche es erneut.";
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network error") ||
    normalized.includes("load failed")
  ) {
    return "Keine Internetverbindung oder Supabase ist derzeit nicht erreichbar. Bitte prüfe deine Verbindung und versuche es erneut.";
  }

  return message;
}
