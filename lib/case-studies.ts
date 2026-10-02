export type CaseStudy = {
  slug: string;
  number: string;
  client: string;
  title: string;
  category: string;
  image: string;
  summary: string;
  focus: string[];
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
    title: 'A legacy told in the present tense.',
    category: 'Financial services · Campaign',
    image: 'https://i.vimeocdn.com/video/2172888129-c4781015a82d2e8ce7e253c53f95f5031be2b7acccb1e1f2898fb7d7c943bcb8-d_1920x1080?&r=pad&region=us',
    summary: 'A placeholder for a case study about connecting a long-standing mission to the everyday lives it protects.',
    focus: ['Positioning', 'Creative platform', 'Integrated video'],
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
