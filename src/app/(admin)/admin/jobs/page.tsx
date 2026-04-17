"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase";
import type { Job } from "@/types";
import { AddressInput } from "@/components/AddressInput";
import { Card } from "@/components/ui/Card";
import { SmartBack } from "@/components/SmartBack";

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [addressSearch, setAddressSearch] = useState("");

  const visible = useMemo(() => {
    const q = addressSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => (j.addressLine ?? "").toLowerCase().includes(q));
  }, [jobs, addressSearch]);

  useEffect(() => {
    if (!firebaseApp) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Job[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Job, "id">),
        }));
        setJobs(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 pb-10 pt-6">
      <div className="flex items-start gap-3">
        <SmartBack inline className="mt-1" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin · Jobs</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Live job addresses (read-only search preview).
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Search addresses (Places autocomplete + text filter)
        </div>
        <div className="mt-2 max-w-xl">
          <AddressInput
            value={addressSearch}
            onChange={setAddressSearch}
            placeholder="Filter list by street, city, or ZIP…"
          />
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-zinc-500">No jobs yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No jobs match this address filter.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {j.serviceName ?? j.serviceId} · {j.status}
                  </div>
                  <div className="mt-1 font-mono text-xs text-emerald-600/90 dark:text-emerald-300/90">
                    {j.addressLine ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    ZIP: {j.zip ?? "—"} · {j.city ?? "—"}
                  </div>
                </div>
                <div className="text-xs text-zinc-400">{j.id}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
