import Experience from '@/components/experience';
import type { Role } from '@/lib/domain';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const role = ['guest', 'captain', 'kitchen', 'cashier', 'manager'].includes(
    p.view || '',
  )
    ? (p.view as Role)
    : 'guest';
  const t = Number(p.table || 12);
  return (
    <Experience
      initialRole={role}
      initialTable={Number.isInteger(t) && t >= 1 && t <= 12 ? t : 12}
    />
  );
}
