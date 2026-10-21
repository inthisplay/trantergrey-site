import { SiteFooter } from '@/components/SiteFooter';
import { Fragment } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { ProjectInquiryForm } from '@/components/ProjectInquiryForm';
import { VideoGallery } from '@/components/VideoGallery';
import { FixedReelVisibility } from '@/components/FixedReelVisibility';
import { HeroReelTimer } from '@/components/HeroReelTimer';
import { MotionStrips } from '@/components/MotionStrips';
import { HomepageMotion } from '@/components/HomepageMotion';
import { toPublicVideo, videos } from '@/lib/videos';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import { caseStudies } from '@/lib/case-studies';

export const dynamic = 'force-dynamic';

const statementSegments = [
  { text: 'Attention is easy to buy.', muted: true },
  { text: 'Relevance is earned.' },
  { text: 'We make films, campaigns, and digital experiences', muted: true },
  { text: 'with a point of view.' },
  { text: 'So your brand shows up with something to say. Done right, it', muted: true },
  { text: 'pulls people in,' },
  { text: 'earns a second look, and gives every next move more momentum. Because good marketing isn\'t decoration.', muted: true },
  { text: 'It\'s a decision.' },
];

function StatementWords() {
  let wordIndex = 0;

  return statementSegments.flatMap((segment) => segment.text.split(' ').map((word) => {
    const index = wordIndex++;
    return <Fragment key={`${segment.text}-${index}`}>
      <span
        className={`statement-word${segment.muted ? ' statement-word--muted' : ''}`}
        data-statement-word
        style={{ transitionDelay: `${index * 22}ms` }}
      >
        {word}
      </span>{' '}
    </Fragment>;
  }));
}

export default async function Home() {
  const library = await getVimeoLibrary();
  const stripVideos = library?.videos
    .filter((video) => video.libraryStatus === 'published' && (video.localTags ?? []).some((tag) => tag.toLocaleLowerCase() === 'homepage-strip'))
    .map(toPublicVideo) ?? videos.slice(0, 5);

  return (
    <>
      <main id="top">
        <HomepageMotion />
        <div className="hero-video site-video-backdrop">
          <iframe id="hero-reel" src="https://player.vimeo.com/video/1236332256?h=9e76772a88&background=1&autoplay=1&loop=1&muted=1&autopause=0&title=0&byline=0&portrait=0" allow="autoplay" title="TG Demo Reel 2026" />
        </div>
        <div className="film-texture-backdrop" aria-hidden="true">
          <video src="/assets/film-grain-overlay.mp4" loop muted playsInline preload="auto" />
        </div>
        <FixedReelVisibility />
        <section className="hero">
          <div className="hero-wash" />
          <SiteHeader />
          <div className="hero-content">
            <h1>Make your<br /><em>next move</em><br />matter.</h1>
            <div className="hero-bottom"><p className="eyebrow hero-location">Independent agency · Evans, Georgia</p></div>
          </div>
          <HeroReelTimer />
        </section>

        <section className="intro" id="about">
          <p className="section-index">01 / Who we are</p>
          <div className="intro-body">
            <h2>We turn a good story into <em>something people remember.</em></h2>
            <p className="intro-copy">TranterGrey is a multi-Emmy award-winning creative agency built around one simple idea: a business grows faster when its marketing has a point of view. We bring strategy, video, design, and digital execution together under one roof.</p>
            <a className="text-link" href="/#contact">Tell us about your brand ↗</a>
            <div className="intro-services" aria-label="What we do">
              <article>
                <h3>Think first.</h3>
                <span>Strategy without the 97-slide deck.</span>
              </article>
              <article>
                <h3>Make it move.</h3>
                <span>Films people don&apos;t want to skip.</span>
              </article>
              <article>
                <h3>Make a big deal.</h3>
                <span>Ideas with enough legs to go places.</span>
              </article>
              <article>
                <h3>The internet, but useful.</h3>
                <span>A nice place for your best ideas to land.</span>
              </article>
            </div>
          </div>
        </section>

        {stripVideos.length > 0 && <MotionStrips videos={stripVideos} />}

        <section className="work" id="work">
          <div className="section-heading">
            <p className="section-index">02 / Selected work</p>
            <div className="work-summary">
              <h2>Stories with <em>movement.</em></h2>
              <p>Commercials, campaigns, and brand films built to move an audience—and leave your brand with more than a moment of attention. Every frame has a job to do.</p>
              <a className="all-work" href="/our-work">Explore more work ↗</a>
            </div>
          </div>
          <VideoGallery videos={videos.slice(0, 6)} featured />
        </section>

        <section className="client-roster" aria-label="Selected client experience">
          <p className="section-index">Selected client experience</p>
          <div className="client-roster-logo-grid">
            <div className="client-logo"><img src="/assets/clients/taylor-bmw.png" alt="Taylor BMW" /></div>
            <div className="client-logo"><img src="/assets/clients/kart-king.png" alt="Kart King" /></div>
            <div className="client-logo"><img src="/assets/clients/veteran-golfers-association.png" alt="Veteran Golfers Association" /></div>
            <div className="client-logo"><img src="/assets/clients/navy-mutual.png" alt="Navy Mutual" /></div>
            <div className="client-logo"><img src="/assets/clients/tub-doctor.png" alt="Tub Doctor" /></div>
            <div className="client-logo"><img src="/assets/clients/salvation-army.png" alt="The Salvation Army" /></div>
            <div className="client-logo"><img src="/assets/clients/kenneth-shuler.png" alt="Kenneth Shuler School of Cosmetology" /></div>
            <div className="client-logo"><img src="/assets/clients/mabra-law.png" alt="Mabra Law" /></div>
            <div className="client-logo"><img src="/assets/clients/bl-schools.png" alt="BL Schools" /></div>
            <div className="client-logo"><img src="/assets/clients/pediatric-associates.png" alt="Pediatric Associates of Savannah" /></div>
          </div>
        </section>
        <section className="statement-band">
          <p className="statement-copy"><StatementWords /></p>
        </section>

        <section className="capabilities" id="capabilities">
          <p className="section-index">03 / What we do</p>
          <div className="capability-list">
            <details open>
              <summary><span>01</span> Brand strategy <i>+</i></summary>
              <div className="capability-detail">
                <p>Clear strategy gives the creative work somewhere to go. We get close to your business, audience, and the decisions in front of you—then turn that intelligence into a platform your team can use.</p>
                <ul>
                  <li>Positioning &amp; messaging</li>
                  <li>Audience insight</li>
                  <li>Brand architecture</li>
                  <li>Go-to-market planning</li>
                </ul>
              </div>
            </details>
            <details>
              <summary><span>02</span> Video production <i>+</i></summary>
              <div className="capability-detail">
                <p>From first thought to final delivery, our writers, producers, and editors stay in the room. That means a film that looks considered, sounds right, and carries the point all the way through.</p>
                <ul>
                  <li>Concepts &amp; scripts</li>
                  <li>Casting &amp; locations</li>
                  <li>Production &amp; direction</li>
                  <li>Edit, color &amp; sound</li>
                </ul>
              </div>
            </details>
            <details>
              <summary><span>03</span> Campaign creative <i>+</i></summary>
              <div className="capability-detail">
                <p>A campaign needs more than a launch moment. We build the idea, visual language, and toolkits that keep the message recognizable wherever people encounter it.</p>
                <ul>
                  <li>Campaign platforms</li>
                  <li>Integrated art direction</li>
                  <li>Social &amp; channel toolkits</li>
                  <li>Launch &amp; rollout assets</li>
                </ul>
              </div>
            </details>
            <details>
              <summary><span>04</span> Digital experiences <i>+</i></summary>
              <div className="capability-detail">
                <p>Your digital touchpoints should carry the same clarity as everything else. We shape the content, design, and technology into an experience that is useful, fast, and unmistakably yours.</p>
                <ul>
                  <li>Web strategy &amp; UX</li>
                  <li>Content systems</li>
                  <li>Design &amp; development</li>
                  <li>Search, social &amp; media</li>
                </ul>
              </div>
            </details>
          </div>
          <div className="case-studies-teaser">
            <div className="case-studies-teaser-heading"><p className="section-index">Selected case studies</p></div>
            <div className="case-studies-teaser-grid">{caseStudies.map((study) => <a className="case-study-poster" href={`/case-studies/${study.slug}`} key={study.slug}><div className="case-study-poster-image"><img src={study.image} alt="" /><span>{study.number} / Case study</span></div><div className="case-study-poster-copy"><p>{study.client}</p><h4>{study.title}</h4><span>View case study</span></div></a>)}</div>
            <a className="case-studies-all" href="/case-studies">Browse all case studies</a>
          </div>
        </section>

        <section className="home-bts-gallery" aria-label="Behind the scenes at TranterGrey productions">
          <div className="home-bts-gallery-grid">
            <figure><img src="/assets/home-bts/golf-silhouette.jpg" alt="Camera operator filming on a hill at sunset" /></figure>
            <figure><img src="/assets/home-bts/pilates-production.jpg" alt="Production crew filming in a Pilates studio" /></figure>
            <figure><img src="/assets/home-bts/camera-kit.jpg" alt="Cinema camera equipment prepared for a shoot" /></figure>
            <figure><img src="/assets/home-bts/sail-production.jpg" alt="Production team filming aboard a sailboat at sunset" /></figure>
            <figure><img src="/assets/home-bts/office-production.jpg" alt="Camera and lighting setup in an office" /></figure>
            <figure><img src="/assets/home-bts/water-production.jpg" alt="Camera operator filming from the water" /></figure>
          </div>
        </section>

        <section className="contact" id="contact">
          <div className="contact-intro"><p className="section-index">04 / Let&apos;s talk</p><h2>What are we<br /><em>making next?</em></h2><p>Start with a few quick signals. We&apos;ll bring the questions, the thinking, and the momentum.</p><a className="contact-link" href="mailto:hello@trantergrey.com">Prefer email? hello@trantergrey.com ↗</a></div>
          <ProjectInquiryForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
