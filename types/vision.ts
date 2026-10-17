export interface FoodAnalysis {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  /** Nährwerte je erkanntem Item (Foto: Anzeige; Text-Erfassung: je ein food_logs-Eintrag). */
  items?: { name: string; grams: number; calories: number; protein: number; carbs: number; fat: number }[];
  /** Kurzer, motivierender Satz zur Zusammensetzung (nur Foto-Erkennung). */
  health_notes?: string;
}
