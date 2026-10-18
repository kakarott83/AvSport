/** Hilfstypen, damit jede englische Übersetzung exakt dieselben Keys wie die deutsche hat. */

export type Messages = { [key: string]: string | readonly string[] | Messages };

export type Shape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : Shape<T[K]>;
};

export function defineMessages<T extends Messages>(de: T, en: Shape<T>): { de: T; en: Shape<T> } {
  return { de, en };
}
