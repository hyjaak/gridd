import { BackButton } from "@/components/BackButton";

export default function CustomerTrackPage() {
  return (
    <>
      <BackButton href="/home" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-6 pb-10 pt-16 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Customer · Track</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Placeholder. This will show live job status and provider ETA.
      </p>
    </main>
    </>
  );
}

