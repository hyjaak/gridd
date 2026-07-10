/**
 * Generic full-screen skeleton used by Next.js route loading.tsx files.
 * Replaces the white flash + spinner with a content-shaped placeholder so
 * the app feels instant on navigation.
 */
export function AppSkeleton() {
  return (
    <main
      aria-busy="true"
      className="min-h-screen bg-[#060606] px-4 py-6 text-[#eee]"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="gridd-skeleton h-8 w-40" />
        <div className="gridd-skeleton h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <div className="gridd-skeleton h-20" />
          <div className="gridd-skeleton h-20" />
        </div>
        <div className="gridd-skeleton h-24 w-full" />
        <div className="gridd-skeleton h-24 w-full" />
        <div className="gridd-skeleton h-24 w-full" />
      </div>
    </main>
  );
}
