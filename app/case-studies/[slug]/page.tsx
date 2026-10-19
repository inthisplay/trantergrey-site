import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { VimeoPlayGate } from '@/components/VimeoPlayGate';
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

  return (
    <>
      <main id="top" className="case-study-page">
        <section className="case-study-hero">
          <img src={study.image} alt="" />
          <div className="case-study-hero-wash" />
          <SiteHeader />
          <div className="case-study-hero-content">
            <p className="section-index">{study.number} / Case study</p>
            <p>{study.client}</p>
            <h1>{study.title}</h1>
          </div>
        </section>

        <article className="case-study-body">
          <aside><p className="section-index">The brief</p></aside>
          <div>
            <p className="case-study-lede">{study.summary}</p>
            <div className="case-study-meta">
              <div><span>Client</span><p>{study.client}</p></div>
              <div><span>Focus</span><ul>{study.focus.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><span>Category</span><p>{study.category}</p></div>
            </div>

            {study.story ? (
              <div className="case-study-story">
                {study.story.map((block, index) => {
                  if (block.type === 'statement') {
                    return <blockquote className="case-study-statement" key={`${block.emphasis}-${index}`}><p>{block.before}<em>{block.emphasis}</em></p></blockquote>;
                  }

                  if (block.type === 'flow-statement') {
                    return <section className="case-study-flow-statement" key={block.label}>
                      <p className="section-index">{block.label}</p>
                      <div><h2>{block.before}<em>{block.emphasis}</em></h2>{block.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                    </section>;
                  }

                  if (block.type === 'interlude') {
                    return <section className="case-study-interlude" key={block.text}>
                      <div className="case-study-interlude-panel">
                        <span className="case-study-interlude-image" aria-hidden="true" />
                        <p>{block.text}</p>
                        {block.attribution && <span className="case-study-interlude-attribution">{block.attribution}</span>}
                      </div>
                    </section>;
                  }

                  if (block.type === 'full-bleed') {
                    return <section className="case-study-full-bleed" key={block.title}>
                      <div><p className="section-index">{block.label}</p><h2>{block.title}</h2></div>
                      <div>{block.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                    </section>;
                  }

                  if (block.type === 'film-pair') {
                    const { film, copy } = block;
                    return <section className="case-study-film-pair" data-player-side={block.playerSide} key={film.id}>
                      <figure className="case-study-featured-video">
                        <div className="case-study-video-frame"><VimeoPlayGate id={film.id} hash={film.hash} title={`${study.client}: ${film.title}`} /></div>
                        <figcaption><p className="section-index">{film.label}</p><strong>{film.title}</strong><p className="case-study-video-description">{film.description}</p></figcaption>
                      </figure>
                      <section className="case-study-film-pair-copy">
                        {copy.type === 'flow-statement' ? <><p className="section-index">{copy.label}</p><h2>{copy.before}<em>{copy.emphasis}</em></h2><div>{copy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></> : <><p className="section-index">{copy.label}</p>{copy.details && <ul>{copy.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}<h2>{copy.heading}</h2><div>{copy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></>}
                      </section>
                    </section>;
                  }

                  if (block.type === 'video') {
                    return <figure className="case-study-featured-video" key={block.id}>
                      <div className="case-study-video-frame"><VimeoPlayGate id={block.id} hash={block.hash} title={`${study.client}: ${block.title}`} /></div>
                      <figcaption><p className="section-index">{block.label}</p><strong>{block.title}</strong><p className="case-study-video-description">{block.description}</p></figcaption>
                    </figure>;
                  }

                  return <section className="case-study-story-section" key={block.label}>
                    <div><p className="section-index">{block.label}</p>{block.details && <ul>{block.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}</div>
                    <div>{block.heading && <h2>{block.heading}</h2>}{block.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                  </section>;
                })}
              </div>
            ) : study.sections ? (
              <div className="case-study-sections">{study.sections.map((section) => <section key={section.title}><p className="section-index">{section.title}</p><div>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}</div>
            ) : (
              <div className="case-study-placeholder"><p className="section-index">In development</p><h2>The full story is on its way.</h2><p>This page is structured and ready for the final case-study materials: challenge, strategy, creative work, results, and the film itself.</p></div>
            )}

            {study.videos && <section className="case-study-videos"><p className="section-index">Featured films</p><div>{study.videos.map((video) => <figure key={video.id}><div><VimeoPlayGate id={video.id} hash={video.hash} title={`${study.client}: ${video.title}`} /></div><figcaption>{video.title}</figcaption></figure>)}</div></section>}

            {(study.story || study.sections) && <section className="case-study-closing"><p className="section-index">Campaign ongoing</p><h2>The work<br /><em>continues.</em></h2><p>More family stories are still taking shape.</p></section>}
            <a className="case-study-back" href="/case-studies">Back to all case studies</a>
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
