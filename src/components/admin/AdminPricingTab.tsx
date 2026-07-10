"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { firebaseApp, firebaseAuth } from "@/lib/firebase";
import { GRIDD_PRICING, type GriddServiceId, type PricingConfigDoc } from "@/lib/pricing";
import {
  DEFAULT_SMART_DISCOUNT_CONFIG,
  type SmartDiscountConfig,
} from "@/lib/smartDiscount";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const IDS = Object.keys(GRIDD_PRICING) as GriddServiceId[];

export function AdminPricingTab() {
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);
  const [rows, setRows] = useState<Record<string, PricingConfigDoc>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "pricingConfig"), (snap) => {
      const next: Record<string, PricingConfigDoc> = {};
      snap.docs.forEach((d) => {
        next[d.id] = d.data() as PricingConfigDoc;
      });
      setRows(next);
    });
    return () => unsub();
  }, [db]);

  const save = useCallback(
    async (serviceId: string, patch: PricingConfigDoc) => {
      if (!db || !firebaseAuth?.currentUser) return;
      setSaving(serviceId);
      try {
        await setDoc(
          doc(db, "pricingConfig", serviceId),
          {
            ...patch,
            updatedAt: serverTimestamp(),
            updatedBy: firebaseAuth.currentUser.uid,
          },
          { merge: true },
        );
      } finally {
        setSaving(null);
      }
    },
    [db],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">PriceIQ™ — CEO pricing</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Overrides merge with defaults in <code className="text-zinc-400">/lib/pricing.ts</code>. Beat % is
          the discount vs competitor list (0.05 = 5%).
        </p>
      </div>

      <div className="space-y-4">
        {IDS.map((id) => {
          const def = GRIDD_PRICING[id];
          const cur = rows[id] ?? {};
          const base =
            def && "baseFare" in def && typeof def.baseFare === "number" ? def.baseFare : 0;
          const pm =
            def && "perMile" in def && typeof (def as { perMile?: number }).perMile === "number"
              ? (def as { perMile: number }).perMile
              : 0;
          const min =
            def && "minimum" in def && typeof (def as { minimum?: number }).minimum === "number"
              ? (def as { minimum: number }).minimum
              : 0;

          return (
            <div
              key={id}
              className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4"
            >
              <div className="font-mono text-sm font-semibold text-[#00FF88]">{id}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="baseFare"
                  defaultNum={cur.baseFare ?? base}
                  onSave={(v) => void save(id, { ...cur, baseFare: v })}
                  disabled={saving === id}
                />
                <Field
                  label="perMile"
                  defaultNum={cur.perMile ?? pm}
                  onSave={(v) => void save(id, { ...cur, perMile: v })}
                  disabled={saving === id}
                />
                <Field
                  label="minimum"
                  defaultNum={cur.minimum ?? min}
                  onSave={(v) => void save(id, { ...cur, minimum: v })}
                  disabled={saving === id}
                />
                <Field
                  label="surgeMultiplier"
                  defaultNum={cur.surgeMultiplier ?? 1}
                  onSave={(v) => void save(id, { ...cur, surgeMultiplier: v })}
                  disabled={saving === id}
                />
                <Field
                  label="beatPercent (e.g. 0.05)"
                  defaultNum={cur.beatPercent ?? 0.05}
                  onSave={(v) => void save(id, { ...cur, beatPercent: v })}
                  disabled={saving === id}
                />
                <Field
                  label="platformFee (e.g. 0.15)"
                  defaultNum={cur.platformFee ?? 0.15}
                  onSave={(v) => void save(id, { ...cur, platformFee: v })}
                  disabled={saving === id}
                />
                {id === "cuts" ? (
                  <>
                    <Field
                      label="cutsTreeSmall"
                      defaultNum={cur.cutsTreeSmall ?? 150}
                      onSave={(v) => void save(id, { ...cur, cutsTreeSmall: v })}
                      disabled={saving === id}
                    />
                    <Field
                      label="cutsTreeMedium"
                      defaultNum={cur.cutsTreeMedium ?? 450}
                      onSave={(v) => void save(id, { ...cur, cutsTreeMedium: v })}
                      disabled={saving === id}
                    />
                    <Field
                      label="cutsTreeLarge"
                      defaultNum={cur.cutsTreeLarge ?? 900}
                      onSave={(v) => void save(id, { ...cur, cutsTreeLarge: v })}
                      disabled={saving === id}
                    />
                    <Field
                      label="cutsTreeVeryLarge"
                      defaultNum={cur.cutsTreeVeryLarge ?? 1500}
                      onSave={(v) => void save(id, { ...cur, cutsTreeVeryLarge: v })}
                      disabled={saving === id}
                    />
                    <Field
                      label="cutsStump"
                      defaultNum={cur.cutsStump ?? 150}
                      onSave={(v) => void save(id, { ...cur, cutsStump: v })}
                      disabled={saving === id}
                    />
                    <Field
                      label="cutsMinimum"
                      defaultNum={cur.cutsMinimum ?? 150}
                      onSave={(v) => void save(id, { ...cur, cutsMinimum: v })}
                      disabled={saving === id}
                    />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
        <SmartDiscountSettingsBlock />
      </div>
    </div>
  );
}

function Field({
  label,
  defaultNum,
  onSave,
  disabled,
}: {
  label: string;
  defaultNum: number;
  onSave: (v: number) => void;
  disabled: boolean;
}) {
  const [val, setVal] = useState(String(defaultNum));
  useEffect(() => {
    setVal(String(defaultNum));
  }, [defaultNum]);

  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <div className="mt-1 flex gap-2">
        <Input
          className="font-mono text-sm"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onSave(parseFloat(val) || 0)}>
          Save
        </Button>
      </div>
    </label>
  );
}

const SMART_ID = "smartDiscount" as const;

function mergeRules(base: SmartDiscountConfig["rules"], fromFs: unknown): SmartDiscountConfig["rules"] {
  if (!fromFs || typeof fromFs !== "object") return { ...base };
  return { ...base, ...(fromFs as SmartDiscountConfig["rules"]) };
}

function SmartDiscountSettingsBlock() {
  const db = useMemo(() => (firebaseApp ? getFirestore(firebaseApp) : null), []);
  const [row, setRow] = useState<Partial<SmartDiscountConfig> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!db) return;
    const dref = doc(db, "pricingConfig", SMART_ID);
    const unsub = onSnapshot(dref, (snap) => {
      setRow(snap.exists() ? (snap.data() as Partial<SmartDiscountConfig>) : {});
    });
    return () => unsub();
  }, [db]);

  const effective = { ...DEFAULT_SMART_DISCOUNT_CONFIG, ...row, rules: mergeRules(DEFAULT_SMART_DISCOUNT_CONFIG.rules, row?.rules) };

  const savePatch = useCallback(
    async (patch: Partial<SmartDiscountConfig>) => {
      if (!db || !firebaseAuth?.currentUser) return;
      setSaving(true);
      try {
        await setDoc(
          doc(db, "pricingConfig", SMART_ID),
          { ...patch, updatedAt: serverTimestamp(), updatedBy: firebaseAuth.currentUser.uid },
          { merge: true },
        );
      } finally {
        setSaving(false);
      }
    },
    [db],
  );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-4">
      <div className="font-mono text-sm font-semibold text-[#00FF88]">Smart Discount — live rules</div>
      <p className="mt-1 text-xs text-zinc-500">Stored in pricingConfig / smartDiscount. Merged with defaults in code.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="amount ($)"
          defaultNum={effective.amount}
          onSave={(v) => void savePatch({ amount: v })}
          disabled={saving}
        />
        <Field
          label="min job value — returning ($)"
          defaultNum={effective.minJobValue}
          onSave={(v) => void savePatch({ minJobValue: v })}
          disabled={saving}
        />
        <Field
          label="min profit after discount — CEO net ($)"
          defaultNum={effective.minGriddProfit}
          onSave={(v) => void savePatch({ minGriddProfit: v })}
          disabled={saving}
        />
        <Field
          label="min miles (rides)"
          defaultNum={effective.minMilesRide}
          onSave={(v) => void savePatch({ minMilesRide: v })}
          disabled={saving}
        />
        <Field
          label="min first-order total ($) — &gt; this"
          defaultNum={effective.minNewCustomerJobValue}
          onSave={(v) => void savePatch({ minNewCustomerJobValue: v })}
          disabled={saving}
        />
        <Field
          label="Surge no-discount if Uber &gt; (×)"
          defaultNum={effective.surgeBlockAbove}
          onSave={(v) => void savePatch({ surgeBlockAbove: v })}
          disabled={saving}
        />
      </div>
      <div className="mt-4 space-y-2 text-sm text-zinc-300">
        {(
          [
            ["newCustomerBoost", "New customer boost"] as const,
            ["loyaltyEvery5th", "Loyalty every 5th job"] as const,
            ["slowHourStimulator", "Slow hour (10a–3p)"] as const,
            ["lateNightBoost", "Late night (10p–4a)"] as const,
            ["bigSpender", `Big spender ($${effective.bigSpenderThreshold}+)`] as const,
            ["peakHourBlock", "Block peak (5–9a, 4–8p) for returning"] as const,
            ["surgeProtection", "Surge protection (no discount if Uber &gt; threshold)"] as const,
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-zinc-600"
              checked={!!effective.rules[k]}
              onChange={() =>
                void savePatch({ rules: { ...effective.rules, [k]: !effective.rules[k] } })
              }
              disabled={saving}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
