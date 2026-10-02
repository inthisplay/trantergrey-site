import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { caseStudies } from '@/lib/case-studies';

export const metadata = { title: 'Case Studies — TranterGrey' };

export default function CaseStudiesPage() {
  return <><main id="top" className="case-studies-page"><section className="case-studies-intro"><SiteHeader /><p className="section-index">Case studies</p><h1>Work with<br /><em>a point of view.</em></h1><p>Selected stories from brands that needed their next move to mean something.</p></section><section className="case-studies-grid" aria-label="Case studies">{caseStudies.map((study) => <a className="case-study-poster" href={`/case-studies/${study.slug}`} key={study.slug}><div className="case-study-poster-image"><img src={study.image} alt="" /><span>{study.number} / Case study</span></div><div className="case-study-poster-copy"><p>{study.client}</p><h2>{study.title}</h2><span>View case study</span></div></a>)}</section></main><SiteFooter /></>;
}
