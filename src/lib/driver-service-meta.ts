/** Shared service visuals for driver (and admin) job cards */
export const DRIVER_SERVICE_META: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  haul: { icon: "🚛", color: "#FF6B00", label: "Haul" },
  send: { icon: "📦", color: "#3B82F6", label: "Send" },
  ride: { icon: "🚗", color: "#8B5CF6", label: "Ride" },
  help: { icon: "💪", color: "#F59E0B", label: "Help" },
  cuts: { icon: "🌳", color: "#22c55e", label: "Cuts" },
  lawn: { icon: "🌿", color: "#16a34a", label: "Lawn" },
  pressure: { icon: "💧", color: "#06B6D4", label: "Pressure" },
  snow: { icon: "❄️", color: "#93C5FD", label: "Snow" },
  gutter: { icon: "🏠", color: "#A78BFA", label: "Gutter" },
  fence: { icon: "🔧", color: "#D97706", label: "Fence" },
  protect: { icon: "🛡️", color: "#EC4899", label: "Protect" },
};

export function serviceMeta(serviceId: string, serviceName: string) {
  return (
    DRIVER_SERVICE_META[serviceId] ?? {
      icon: "✨",
      color: "#00FF88",
      label: serviceName,
    }
  );
}
