// Server page for one material: loads it by id (404 if missing) and renders the quiz UI.
import { notFound } from 'next/navigation';
import { getMaterialById } from '@/lib/materials';
import { MaterialPageClient } from './MaterialPageClient';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialPage({ params }: PageProps) {
  const { id } = await params;
  const material = await getMaterialById(id);

  if (!material) {
    notFound();
  }

  return <MaterialPageClient material={material} />;
}

