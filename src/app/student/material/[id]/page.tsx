import { notFound } from 'next/navigation';
import { getMaterials, type Material } from '@/lib/materials';
import { MaterialPageClient } from './MaterialPageClient';

// Wymusza renderowanie w runtime (nie podczas buildu) - strony wymagają połączenia z bazą danych
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialPage({ params }: PageProps) {
  const { id } = await params;
  const materials = await getMaterials();
  const material = materials.find((m) => m.id === id);

  if (!material) {
    notFound();
  }

  return <MaterialPageClient material={material} />;
}


