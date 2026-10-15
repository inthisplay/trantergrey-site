import { toPublicVideo } from '@/lib/videos';
import { getVimeoLibrary } from '@/lib/vimeo-library';

export async function SiteFooter() {
  const library = await getVimeoLibrary();
  const footerFilms = library?.videos
    .filter((video) => video.libraryStatus === 'published')
    .map(toPublicVideo) ?? [];

  return <footer className="site-footer">
    <div className="footer-media">
      <video className="footer-glitch" autoPlay muted loop playsInline aria-label="Animated TranterGrey logo"><source src="/assets/tg-glitch-footer.mp4" type="video/mp4" /></video>
      <div className="footer-side footer-contact"><p className="footer-label">Get in touch</p><address>4075 Evans To Locks Rd<br />Evans, GA 30809<br /><a href="tel:+17067318415">+1 706.731.8415</a><br /><a href="mailto:hello@trantergrey.com">hello@trantergrey.com</a></address></div>
      <div className="footer-side footer-link-groups"><div><p className="footer-label">Explore</p><nav className="footer-nav"><a href="/work">Work library</a><a href="/case-studies">Case Studies</a><a href="/#capabilities">Capabilities</a><a href="/#about">About</a></nav></div><div><p className="footer-label">Follow</p><nav className="footer-socials"><a href="https://www.instagram.com/trantergrey/">Instagram</a><a href="https://www.linkedin.com/company/trantergrey-media">LinkedIn</a><a href="https://vimeo.com/trantergrey">Vimeo</a><a href="https://www.youtube.com/channel/UC8WqwP3vLMwW3DI_RCl-QGQ">YouTube</a></nav></div></div>
    </div>
    <div className="footer-body">
      <div className="footer-long-wordmark"><img src="/assets/tg-logo-long-white.png" alt="TranterGrey" /></div>
      {footerFilms.length > 0 && <nav className="footer-reel" aria-label="Featured films">
        <div className="footer-reel-track">
          {[0, 1].map((set) => <div className="footer-reel-set" aria-hidden={set === 1} key={set}>{footerFilms.map((video) => <a href={`/work?play=${video.id}`} key={`${video.id}-${set}`}>{video.client} — {video.title}</a>)}</div>)}
        </div>
      </nav>}
      <p className="footer-signoff">Make something worth <em>watching.</em></p>
      <a className="footer-project" href="/#contact">Start a project <span>↗</span></a>
      <div className="footer-meta"><span>Strategy · Video · Campaigns · Digital</span><a className="top-link" href="#top">Back to top ↑</a><span className="footer-copyright">© {new Date().getFullYear()} TranterGrey <a className="footer-login" href="/login">Login</a></span></div>
    </div>
  </footer>;
}
