import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { caseStudies } from '@/lib/case-studies';

export const metadata = { title: 'Case Studies — TranterGrey' };

export default function CaseStudiesPage() {
  return <>
    <main id="top" className="case-studies-page">
      <SiteHeader />
      <section className="case-studies-simple" aria-labelledby="case-studies-title">
        <p className="section-index" id="case-studies-title">Selected case studies</p>
        <nav className="case-studies-simple-list" aria-label="Case studies">
          {caseStudies.map((study) => <a href={`/case-studies/${study.slug}`} key={study.slug}>
            <span>{study.number} / {study.client}</span>
            <strong>{study.title}</strong>
          </a>)}
        </nav>
      </section>
    </main>
    <SiteFooter />
  </>;
}
