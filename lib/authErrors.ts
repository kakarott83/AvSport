import { t } from "@/lib/i18n";

export function getAuthErrorMessage(errorMessage?: string | null): string {
  const message = (errorMessage ?? "").trim();

  if (!message) {
    return t("common.unknownError");
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network error") ||
    normalized.includes("load failed")
  ) {
    return t("common.networkError");
  }

  return message;
}
