/**
 * Optional Firebase scheduled function — calls your deployed Vercel cron endpoint
 * so competitor cache stays warm without duplicating Perplexity logic in Cloud Functions.
 *
 * 1. Set config: `firebase functions:config:set vercel.cron_url="https://YOUR_DOMAIN/api/cron/price-intelligence"`
 * 2. Set secret header in Vercel env: CRON_SECRET
 * 3. Deploy: `firebase deploy --only functions`
 *
 * Alternatively rely on Vercel Cron only (see vercel.json).
 */
const functions = require("firebase-functions");
const fetch = require("node-fetch");

exports.updatePriceIntelligence = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const url = process.env.VERCEL_CRON_URL;
    const secret = process.env.CRON_SECRET;
    if (!url || !secret) {
      console.warn("[updatePriceIntelligence] Skip: VERCEL_CRON_URL or CRON_SECRET unset");
      return null;
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    }).catch((e) => {
      console.error(e);
      return null;
    });
    if (res) console.log("[updatePriceIntelligence]", res.status, await res.text());
    return null;
  });
