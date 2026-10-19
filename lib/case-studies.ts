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
  story?: CaseStudyStoryBlock[];
};

export type CaseStudyStoryBlock =
  | {
      type: 'section';
      label: string;
      heading?: string;
      paragraphs: string[];
      details?: string[];
    }
  | {
      type: 'statement';
      before: string;
      emphasis: string;
    }
  | {
      type: 'video';
      id: string;
      hash: string;
      title: string;
      label: string;
      description: string;
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
    story: [
      {
        type: 'section',
        label: 'The brief',
        heading: 'Five distinct stories. One shared idea.',
        paragraphs: [
          'Navy Mutual came to us with five client-supplied scripts connected by one focus: family. Our role was to turn that through-line into a campaign that felt human from the first frame to the last.',
          'That meant carrying the work from planning and casting through production, post-production, and client-reviewed revisions.',
        ],
        details: ['Five-film campaign', 'Client-supplied scripts', 'Family at the center'],
      },
      {
        type: 'video',
        id: '1204536993',
        hash: '02cf81e62c',
        title: 'The Nest',
        label: '01 / Featured film',
        description: 'One of the finished stories in the Navy Mutual family campaign.',
      },
      {
        type: 'statement',
        before: 'Believability lives in ',
        emphasis: 'the details.',
      },
      {
        type: 'section',
        label: 'The challenge',
        heading: 'Make every moment feel lived in.',
        paragraphs: [
          'A campaign about family depends on people, places, and small visual details that feel credible—not staged. Casting had to meet the client’s criteria, while locations and props had to give every scene a sense of place.',
          'Military wardrobe required especially close coordination. It needed to follow military guidelines and Navy Mutual’s requirements while still looking natural on screen. Across all five films, the stories also had to remain clear, engaging, and concise enough for their commercial format.',
        ],
        details: ['Casting', 'Locations + props', 'Military wardrobe'],
      },
      {
        type: 'video',
        id: '1199857515',
        hash: '9419771e0c',
        title: 'Bedtime Drill Sergeant',
        label: '02 / Featured film',
        description: 'A second story shaped around the people and details that make a family feel real.',
      },
      {
        type: 'section',
        label: 'The approach',
        heading: 'Do the homework before the shoot.',
        paragraphs: [
          'We started with light script revisions to improve flow without losing the client’s message. From there, we coordinated casting, locations, wardrobe, props, and filming dates so the production had the right pieces in place before cameras rolled.',
          'The preparation continued into the shot list. Before each shoot, the team studied and practiced the planned coverage, arriving with a shared understanding of the scene, the performance, and the footage the edit would need.',
        ],
        details: ['Script flow', 'Shot planning', 'Production coordination'],
      },
      {
        type: 'statement',
        before: 'A plan for every frame. ',
        emphasis: 'Room for every real moment.',
      },
      {
        type: 'section',
        label: 'The creative work',
        heading: 'Bring the plan to life. Then shape the story.',
        paragraphs: [
          'On set, the prepared cast, locations, wardrobe, and props gave the crew a practical foundation. The shot list kept everyone aligned around the performances and details each edit would require.',
          'In post, our three editors shaped the footage for pacing, clarity, and commercial-length storytelling. Navy Mutual’s reviews guided the refinements, keeping the finished work close to the client’s vision without losing the human feel of the campaign.',
        ],
        details: ['Production', 'Three-editor post team', 'Client-reviewed revisions'],
      },
      {
        type: 'video',
        id: '1181639716',
        hash: '93947cc90d',
        title: 'Home Front',
        label: '03 / Featured film',
        description: 'The campaign continues to grow, one family story at a time.',
      },
      {
        type: 'section',
        label: 'The result',
        heading: 'A campaign built to hold together.',
        paragraphs: [
          'The result is a five-video campaign connected by a consistent family theme. From refining the supplied scripts to completing client-reviewed edits, TGM coordinated the production details that carry Navy Mutual’s message across the series.',
        ],
      },
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
