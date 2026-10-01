const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  nav.classList.toggle('open', !isOpen);
});
document.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));
document.querySelectorAll('.video-card video').forEach((video) => {
  const host = video.closest('.project');
  host.addEventListener('mouseenter', () => video.play().catch(() => {}));
  host.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
});
const year = new Date().getFullYear();
const inlineYear = document.querySelector('#year');
const footerYear = document.querySelector('#footer-year');
if (inlineYear) inlineYear.textContent = year;
if (footerYear) footerYear.textContent = year;

const videoModal = document.querySelector('.video-modal');
const modalTitle = document.querySelector('#video-modal-title');
const modalFrame = document.querySelector('.modal-player iframe');
const modalClose = document.querySelector('.modal-close');

document.querySelectorAll('.project-trigger').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    const { vimeoId, vimeoHash, title } = trigger.dataset;
    const hash = vimeoHash ? `h=${vimeoHash}&` : '';
    modalTitle.textContent = title;
    modalFrame.src = `https://player.vimeo.com/video/${vimeoId}?${hash}autoplay=1&title=0&byline=0&portrait=0`;
    videoModal.showModal();
  });
});

const closeVideoModal = () => videoModal.close();
modalClose.addEventListener('click', closeVideoModal);
videoModal.addEventListener('click', (event) => {
  if (event.target === videoModal) closeVideoModal();
});
videoModal.addEventListener('close', () => { modalFrame.src = ''; });
