/**
 * One-time seed: Ivoire Market & Cuisine + DRINKS menu under restaurants/{id}/menu
 * Requires the same Firebase Admin env vars as the app (.env.local).
 *
 * Usage: node scripts/seed-ivoire-market.cjs
 */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).replace(/\\n/g, "\n");
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY ?? process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKeyRaw || privateKeyRaw.includes("PASTE_FULL_KEY_HERE")) {
  console.error(
    "Missing Firebase admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local",
  );
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();
const REST_ID = "ivoire-market-cuisine";

/** @type {readonly [string, number][]} */
const DRINKS = [
  ["Water", 1.49],
  ["Coca Cola Can", 1.89],
  ["Fanta Can", 1.89],
  ["Sprite Can", 1.89],
  ["Red Bull", 4.99],
  ["Coconut Juice Small", 2.0],
  ["Coconut Juice Big", 3.0],
  ["Tamarind Juice", 2.5],
  ["Cocktail De Fruits", 3.99],
  ["Mango Juice", 1.99],
  ["Schweppes", 3.0],
  ["Pineapple Juice", 2.69],
  ["Beta Flava", 2.99],
];

function slug(name) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  return s || "item";
}

async function main() {
  const root = db.collection("restaurants").doc(REST_ID);
  const rootSnap = await root.get();

  /** @type {Record<string, unknown>} */
  const restaurant = {
    name: "Ivoire Market & Cuisine",
    cuisine: "African · Ivorian",
    address: "1210 Rockbridge Rd Suite L, Norcross, GA 30093",
    phone: "770-451-4768",
    lat: 33.9425,
    lng: -84.2196,
    deliveryFee: 3.99,
    minOrder: 15.0,
    estimatedTime: "30-45",
    priceRange: "$$",
    isOpen: true,
    isManualEntry: true,
    hours: {
      mon: "11:00-22:00",
      tue: "11:00-22:00",
      wed: "11:00-22:00",
      thu: "11:00-22:00",
      fri: "11:00-22:00",
      sat: "11:00-22:00",
      sun: "11:00-22:00",
    },
  };
  if (!rootSnap.exists) {
    restaurant.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await root.set(restaurant, { merge: true });

  const menuSnap = await root.collection("menu").get();
  let batch = db.batch();
  let ops = 0;
  for (const d of menuSnap.docs) {
    batch.delete(d.ref);
    ops += 1;
    if (ops >= 500) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops) await batch.commit();

  batch = db.batch();
  DRINKS.forEach(([name, price], i) => {
    batch.set(root.collection("menu").doc(slug(name)), {
      name,
      price,
      category: "DRINKS",
      isAvailable: true,
      gridditCount: 0,
      orderCount: 0,
      sortOrder: i,
    });
  });
  await batch.commit();
  console.log("OK: restaurants/%s — %d menu docs (menu replaced)", REST_ID, DRINKS.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
