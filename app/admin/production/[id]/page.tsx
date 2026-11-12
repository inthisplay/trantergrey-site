import { SiteHeader } from '@/components/SiteHeader';
import { ProductionCard } from '@/components/ProductionCard';
export default async function ProductionCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="admin-detail production-admin"><SiteHeader adminArea /><section><a className="admin-back" href="/admin/production">← The Deck</a><ProductionCard id={id} /></section></main>;
}
