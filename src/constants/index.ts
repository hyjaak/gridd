export const colors = {
  primary: "#00FF88",
  secondary: "#FF6B00",
  background: "#060606",
  card: "#0a0a0a",
  border: "#1a1a1a",
  text: "#eeeeee",
  sub: "#555555",
};

export const services = [
  {
    id: "haul",
    name: "Haul",
    description: "Pickup, dump runs, large item hauling.",
    category: "Logistics",
  },
  {
    id: "send",
    name: "Send",
    description: "Local delivery and drop-offs.",
    category: "Logistics",
  },
  {
    id: "ride",
    name: "Ride",
    description: "Neighborhood rides and pickups.",
    category: "Transport",
  },
  {
    id: "help",
    name: "Help",
    description: "General help by the hour.",
    category: "General",
  },
  {
    id: "cuts",
    name: "Cuts",
    description: "Tree trimming and removal.",
    category: "Home",
  },
  {
    id: "lawn",
    name: "Lawn",
    description: "Mow, edge, and yard cleanup.",
    category: "Home",
  },
  {
    id: "pressure",
    name: "Pressure",
    description: "Pressure washing for driveways and siding.",
    category: "Home",
  },
  {
    id: "snow",
    name: "Snow",
    description: "Snow shoveling and salting.",
    category: "Seasonal",
  },
  {
    id: "gutter",
    name: "Gutter",
    description: "Gutter cleaning and minor repairs.",
    category: "Home",
  },
  {
    id: "fence",
    name: "Fence",
    description: "Fence repairs and installs.",
    category: "Home",
  },
  {
    id: "protect",
    name: "Protect",
    description: "Security checks and neighborhood watch tasks.",
    category: "Safety",
  },
] as const;

export const config = {
  appName: "GRIDD",
  tagline: "The Neighborhood Economy",
};
