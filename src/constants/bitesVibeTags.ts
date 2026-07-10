/** Preset tags for GRIDD Bites “vibe” + hashtag feeds */
export const BITES_VIBE_PRESETS: { id: string; label: string; emoji: string }[] = [
  { id: "2am", label: "2AMHits", emoji: "🌙" },
  { id: "postworkout", label: "PostWorkout", emoji: "💪" },
  { id: "postgame", label: "PostGame", emoji: "🏀" },
  { id: "broke", label: "BrokeCheck", emoji: "💸" },
  { id: "bougie", label: "Bougie", emoji: "👑" },
  { id: "bussin", label: "Bussin", emoji: "🔥" },
  { id: "stress", label: "StressEat", emoji: "😤" },
  { id: "healthy", label: "HealthyIsh", emoji: "💚" },
  { id: "cheat", label: "CheatDay", emoji: "🍕" },
  { id: "family", label: "FamilyFeed", emoji: "👨‍👩‍👧" },
  { id: "study", label: "StudyFuel", emoji: "📚" },
  { id: "heartbreak", label: "HeartbreakMeal", emoji: "💔" },
  { id: "celebration", label: "Celebration", emoji: "🎉" },
  { id: "sick", label: "SickDay", emoji: "🤒" },
  { id: "treat", label: "Treat", emoji: "🍰" },
  { id: "custom", label: "Custom", emoji: "✨" },
];

export function displayVibeFromId(presetId: string, customText?: string): string {
  if (presetId === "custom" && customText?.trim()) return customText.trim();
  const p = BITES_VIBE_PRESETS.find((x) => x.id === presetId);
  if (p) return `${p.emoji} #${p.label}`;
  return customText?.trim() ? `✨ #${customText.trim()}` : "";
}
