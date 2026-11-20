import { requireRole } from '@/lib/auth';
export default async function L({ children }: { children: React.ReactNode }) {
  await requireRole(['ADMIN', 'AGENT']);
  return <>{children}</>;
}
