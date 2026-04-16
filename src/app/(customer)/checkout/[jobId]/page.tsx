import { CheckoutForm } from "@/components/CheckoutForm";
import { BackButton } from "@/components/BackButton";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <main className="min-h-full bg-[#060606]">
      <BackButton href="/book" />
      <div className="mx-auto w-full max-w-lg px-6 pb-10 pt-16 sm:pt-10">
        <CheckoutForm jobId={jobId} />
      </div>
    </main>
  );
}
