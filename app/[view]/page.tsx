import DexApp from '@/components/dex-app';
import { notFound } from 'next/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (
    !['missing', 'legends', 'routes', 'bank', 'settings', 'living'].includes(
      view,
    )
  )
    notFound();
  return <DexApp view={view} />;
}
