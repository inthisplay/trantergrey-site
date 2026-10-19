export type CaseStudy = {
  slug: string;
  number: string;
  client: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  focus: string[];
  sections?: Array<{ title: string; paragraphs: string[] }>;
  videos?: Array<{ id: string; hash: string; title: string }>;
};

export const caseStudies: CaseStudy[] = [
  {
    slug: 'batesburg-leesville-schools',
    number: '01',
    client: 'Batesburg-Leesville Schools',
    title: 'A district story worth showing up for.',
    category: 'Education · Brand storytelling',
    image: 'https://i.vimeocdn.com/video/2199050484-1f48112b49017da304ed12e88fdf43bbe38b26d8b977cfd9d07bde067c213374-d_1920x1080?&r=pad&region=us',
    summary: 'A placeholder for the story of how a school district can make its people, programs, and possibilities feel more immediate.',
    focus: ['Brand narrative', 'Campaign system', 'Film production'],
  },
  {
    slug: 'navy-mutual',
    number: '02',
    client: 'Navy Mutual',
    title: 'Five videos. One focus: family.',
    category: 'Financial services · Video campaign',
    image: 'https://i.vimeocdn.com/video/2172888129-c4781015a82d2e8ce7e253c53f95f5031be2b7acccb1e1f2898fb7d7c943bcb8-d_1920x1080?&r=pad&region=us',
    summary: 'Navy Mutual wanted a campaign of five videos connected by a shared theme: family. Working from scripts supplied by the client, TranterGrey Media handled the planning, casting, filming, and editing needed to bring those stories to life.',
    focus: ['Campaign production', 'Casting', 'Post-production'],
    sections: [
      { title: 'The challenge', paragraphs: ['The campaign needed believable people, settings, and details to support its family theme. Military wardrobe presented a particular challenge, requiring careful coordination to ensure the outfits followed both military guidelines and Navy Mutual’s requirements while looking authentic on screen.', 'Casting also needed to meet the client’s criteria, with suitable locations and props bringing each scene together. Across all five videos, the storytelling had to remain engaging and concise within its commercial format.'] },
      { title: 'The approach', paragraphs: ['Our pre-production team began with light script revisions to improve flow while preserving the client’s message. We then coordinated casting, arranged locations, sourced the required wardrobe and props, and scheduled the filming dates.', 'That preparation extended to the shot list. Before each shoot, our production team studied and practiced the planned shots, arriving with a clear understanding of the scenes and the footage needed to tell each story.'] },
      { title: 'The creative work', paragraphs: ['Production brought together the cast, locations, wardrobe, and props prepared for each scene. The shot list gave the crew a shared plan for capturing the performances and visual details needed for the edit.', 'In post-production, TGM drew on the expertise of our three editors to shape the footage. Editing choices focused on pacing, clarity, and keeping each story engaging without losing the concise delivery required for commercial use.', 'Navy Mutual’s reviews guided revisions throughout the process, helping the team refine the videos around the client’s vision.'] },
      { title: 'The result', paragraphs: ['A five-video campaign connected by a consistent family theme. From refining the supplied scripts to completing client-reviewed edits, TGM coordinated the production details that carried Navy Mutual’s message through the series.'] },
    ],
    videos: [
      { id: '1204536993', hash: '02cf81e62c', title: 'The Nest' },
      { id: '1199857515', hash: '9419771e0c', title: 'Bedtime Drill Sergeant' },
      { id: '1181639716', hash: '93947cc90d', title: 'Home Front' },
    ],
  },
  {
    slug: 'taylor-bmw',
    number: '03',
    client: 'Taylor BMW',
    title: 'Performance, without standing still.',
    category: 'Automotive · Film',
    image: 'https://i.vimeocdn.com/video/1996170478-ddc01c34ddaaf95c98b4b410583acd8a23fe046cf5bb0856a560ecf0ec03de87-d_1280?region=us',
    summary: 'A placeholder for a look at how a performance brand can earn attention with work that moves as quickly as its audience.',
    focus: ['Brand film', 'Social cutdowns', 'Dealer marketing'],
  },
];

export function getCaseStudy(slug: string) {
  return caseStudies.find((study) => study.slug === slug);
}
