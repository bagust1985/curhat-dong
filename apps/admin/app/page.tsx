/**
 * Placeholder dashboard. Real metric cards arrive in E14-T14, using the metric
 * definitions fixed in PRD §19.1 — especially Felt Heard Rate, which excludes
 * dismissed prompts from the denominator.
 */
export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Shell admin siap. Metrik, moderation queue, dan banding menyusul di E14.
      </p>
    </>
  );
}
