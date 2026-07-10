import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { bintaVaultDepositCentsFromPlatformFeeCents } from "@/lib/binta-vault";

const VAULT_MAIN = "main";

/**
 * On job complete: move 10% of CEO share into BINTA vault. Idempotent per job. Non-throwing to callers.
 */
export async function recordBintaVaultDepositForCompletedJob(
  db: Firestore,
  jobId: string,
  job: {
    serviceId?: string;
    serviceName?: string;
    amountCents?: number;
    chargedTotalCents?: number;
  },
  platformFeeCents: number,
): Promise<void> {
  const depositCents = bintaVaultDepositCentsFromPlatformFeeCents(platformFeeCents);
  if (depositCents <= 0) return;

  try {
    await db.runTransaction(async (tx) => {
      const jref = db.collection("jobs").doc(jobId);
      const jsnap = await tx.get(jref);
      if (!jsnap.exists) return;
      const data = jsnap.data() as Record<string, unknown> | undefined;
      if (data?.bintaVaultDepositedCents != null) return;

      const vref = db.collection("vault").doc(VAULT_MAIN);
      const vsnap = await tx.get(vref);
      const balanceBefore = (vsnap.data()?.balanceCents as number | undefined) ?? 0;
      const totalDep = (vsnap.data()?.totalDepositedCents as number | undefined) ?? 0;
      const nextBalance = balanceBefore + depositCents;

      tx.set(
        vref,
        {
          balanceCents: nextBalance,
          totalDepositedCents: totalDep + depositCents,
          lastDepositAt: FieldValue.serverTimestamp(),
          lastDepositAmountCents: depositCents,
          lastDepositJobId: jobId,
          updatedAt: FieldValue.serverTimestamp(),
          // Initialize doc on first run
          ...(!vsnap.exists
            ? {
                totalWithdrawnCents: 0,
                monthlyGoalCents: 50_000,
                createdAt: FieldValue.serverTimestamp(),
                name: "BINTA GRIDD VAULT",
              }
            : {}),
        } as Record<string, unknown>,
        { merge: true },
      );

      const tref = db.collection("vaultTransactions").doc();
      tx.set(tref, {
        type: "deposit",
        amountCents: depositCents,
        jobId,
        serviceId: job.serviceId ?? "",
        serviceName: job.serviceName ?? "",
        platformFeeCents,
        jobAmountCents: job.amountCents ?? job.chargedTotalCents ?? 0,
        balanceAfterCents: nextBalance,
        balanceBeforeCents: balanceBefore,
        performedBy: "system",
        source: "job_complete",
        createdAt: FieldValue.serverTimestamp(),
        ipAddress: "server",
      });

      tx.update(jref, {
        bintaVaultDepositedCents: depositCents,
        bintaVaultTransactionId: tref.id,
        bintaVaultAt: FieldValue.serverTimestamp(),
      } as Record<string, unknown>);
    });
  } catch (e) {
    console.error("[BINTA vault] deposit failed", jobId, e);
  }
}

export type BintaWithdrawalResult = { ok: true } | { ok: false; error: string };

/**
 * CEO withdrawal — must run in trusted API with auth + canAccessBintaVault.
 */
export async function recordBintaVaultWithdrawal(
  db: Firestore,
  performedBy: string,
  amountCents: number,
  reason: string,
  ipAddress: string,
): Promise<BintaWithdrawalResult> {
  const trimmed = reason.trim();
  if (amountCents <= 0) return { ok: false, error: "Amount must be positive" };
  if (trimmed.length < 4) return { ok: false, error: "Reason is required" };

  try {
    await db.runTransaction(async (tx) => {
      const vref = db.collection("vault").doc(VAULT_MAIN);
      const vsnap = await tx.get(vref);
      if (!vsnap.exists) {
        throw new Error("NO_VAULT");
      }
      const d = vsnap.data() as { balanceCents?: number; totalWithdrawnCents?: number };
      const bal = d.balanceCents ?? 0;
      if (amountCents > bal) {
        throw new Error("INSUFFICIENT");
      }
      const next = bal - amountCents;
      const tw = (d.totalWithdrawnCents ?? 0) + amountCents;
      const tref = db.collection("vaultTransactions").doc();
      tx.update(vref, {
        balanceCents: next,
        totalWithdrawnCents: tw,
        lastWithdrawalAt: FieldValue.serverTimestamp(),
        lastWithdrawalAmountCents: amountCents,
        lastWithdrawalReason: trimmed,
        updatedAt: FieldValue.serverTimestamp(),
      } as Record<string, unknown>);

      tx.set(tref, {
        type: "withdrawal",
        amountCents,
        jobId: "",
        reason: trimmed,
        balanceBeforeCents: bal,
        balanceAfterCents: next,
        performedBy,
        createdAt: FieldValue.serverTimestamp(),
        ipAddress,
        source: "ceo_withdrawal",
      } as Record<string, unknown>);
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "INSUFFICIENT") return { ok: false, error: "Insufficient vault balance" };
    if (msg === "NO_VAULT") return { ok: false, error: "Vault not initialized" };
    console.error("[BINTA vault] withdraw failed", e);
    return { ok: false, error: "Withdrawal failed" };
  }
}
