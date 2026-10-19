import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { caseStudies, getCaseStudy } from '@/lib/case-studies';

export const dynamicParams = false;

export function generateStaticParams() {
  return caseStudies.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  return { title: study ? `${study.client} Case Study — TranterGrey` : 'Case Study — TranterGrey' };
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) notFound();

  return <><main id="top" className="case-study-page"><section className="case-study-hero"><img src={study.image} alt="" /><div className="case-study-hero-wash" /><SiteHeader /><div className="case-study-hero-content"><p className="section-index">{study.number} / Case study</p><p>{study.client}</p><h1>{study.title}</h1></div></section><article className="case-study-body"><aside><p className="section-index">The brief</p></aside><div><p className="case-study-lede">{study.summary}</p><div className="case-study-meta"><div><span>Client</span><p>{study.client}</p></div><div><span>Focus</span><ul>{study.focus.map((item) => <li key={item}>{item}</li>)}</ul></div><div><span>Category</span><p>{study.category}</p></div></div>{study.sections ? <div className="case-study-sections">{study.sections.map((section) => <section key={section.title}><p className="section-index">{section.title}</p><div>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}</div> : <div className="case-study-placeholder"><p className="section-index">In development</p><h2>The full story is on its way.</h2><p>This page is structured and ready for the final case-study materials: challenge, strategy, creative work, results, and the film itself.</p></div>}{study.videos && <section className="case-study-videos"><p className="section-index">Featured films</p><div>{study.videos.map((video) => <figure key={video.id}><div><iframe src={`https://player.vimeo.com/video/${video.id}?h=${video.hash}&title=0&byline=0&portrait=0`} allow="autoplay; fullscreen; picture-in-picture" title={`${study.client}: ${video.title}`} /></div><figcaption>{video.title}</figcaption></figure>)}</div></section>}{study.sections && <section className="case-study-closing"><p className="section-index">Campaign ongoing</p><h2>The work<br /><em>continues.</em></h2><p>More family stories are still taking shape.</p></section>}<a className="case-study-back" href="/case-studies">Back to all case studies</a></div></article></main><SiteFooter /></>;
}
