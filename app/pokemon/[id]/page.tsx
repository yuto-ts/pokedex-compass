import DexApp from '@/components/dex-app';
import { notFound } from 'next/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > 1025) notFound();
  return <DexApp id={n} />;
}
