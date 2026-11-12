import { SiteHeader } from '@/components/SiteHeader';
import { ProductionBoard } from '@/components/ProductionBoard';
export const metadata = { title: 'TranterGrey - The Deck' };
export default function ProductionBoardPage() { return <main className="admin-detail production-admin"><SiteHeader adminArea /><section><ProductionBoard /></section></main>; }
