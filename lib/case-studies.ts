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
  closing?: {
    label: string;
    before: string;
    emphasis: string;
    copy: string;
  };
};

export type CaseStudyTextBlock =
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
      ghost?: string;
    }
  | {
      type: 'flow-statement';
      label: string;
      before: string;
      emphasis: string;
      paragraphs: string[];
    }
;

export type CaseStudyFilm = {
  id: string;
  hash: string;
  title: string;
  label: string;
  description: string;
  thumbnail?: string;
};

export type CaseStudyPairedCopy = Exclude<CaseStudyTextBlock, { type: 'statement' }>;

export type CaseStudyStoryBlock =
  | CaseStudyTextBlock
  | {
      type: 'interlude';
      text: string;
      attribution?: string;
    }
  | {
      type: 'full-bleed';
      label: string;
      title: string;
      paragraphs: string[];
    }
  | {
      type: 'campaign-map';
      label: string;
      heading: string;
      intro: string;
      items: Array<{ title: string; copy: string }>;
    }
  | {
      type: 'bts-gallery';
      label: string;
      images: Array<{ src: string; alt: string }>;
    }
  | ({ type: 'video' } & CaseStudyFilm)
  | {
      type: 'film-pair';
      playerSide: 'left' | 'right';
      layout?: 'wide-media' | 'wide-copy';
      film: CaseStudyFilm;
      copy: CaseStudyPairedCopy;
    };

export const caseStudies: CaseStudy[] = [
  {
    slug: 'batesburg-leesville-schools',
    number: '01',
    client: 'Batesburg-Leesville Schools',
    title: 'Bringing school life into focus.',
    category: 'Education · School promotion',
    image: 'https://i.vimeocdn.com/video/2199050484-1f48112b49017da304ed12e88fdf43bbe38b26d8b977cfd9d07bde067c213374-d_1920x1080?&r=pad&region=us',
    summary: 'Batesburg-Leesville Schools wanted a way to advertise the school and showcase what it offers. TranterGrey Media developed a campaign that gave athletics, academics, and the arts their own time on screen while connecting them through a broader school story.',
    focus: ['Campaign strategy', 'Video production'],
    story: [
      {
        type: 'section',
        label: 'The brief',
        heading: 'Three subjects. One school story.',
        paragraphs: [
          'Batesburg-Leesville’s Director of Public Information and Community Relations came to TGM after working with our team previously at Kenneth Shuler, another current client. She wanted a campaign that could introduce the school while showing the depth of what students experience there.',
          'The answer was a four-video campaign: dedicated stories for athletics, academics, and the arts, plus a sizzle reel that brings every part together.',
        ],
        details: ['Four-film campaign', 'Athletics · Academics · Arts', 'Schoolwide story'],
      },
      {
        type: 'campaign-map',
        label: 'The campaign',
        heading: 'Four films. Three perspectives. One school story.',
        intro: 'The campaign gave each part of school life room to lead, while the final reel connected every chapter.',
        items: [
          { title: 'Athletics', copy: 'The energy, preparation, and pride behind school sports.' },
          { title: 'Academics', copy: 'The focus and momentum of learning in action.' },
          { title: 'The arts', copy: 'The expression and creative work that round out the student experience.' },
          { title: 'Sizzle reel', copy: 'One broader introduction that brings the complete picture together.' },
        ],
      },
      {
        type: 'film-pair',
        playerSide: 'left',
        layout: 'wide-media',
        film: {
          id: '1212086748',
          hash: '2090b23001',
          title: 'Athletics',
          label: '01 / Featured film',
          description: 'One focused chapter in the Batesburg-Leesville Schools campaign.',
          thumbnail: 'https://i.vimeocdn.com/video/2207175346-020ad442ce2f47ac659445fd77bcbb2f555f5e7a9b7d986a0fae7fe77e22533d-d_1920x1080?&r=pad&region=us',
        },
        copy: {
          type: 'flow-statement',
          label: 'The challenge',
          before: 'A school story unfolds on ',
          emphasis: 'its own schedule.',
          paragraphs: [
            'Representing several parts of school life meant coordinating filming across different activities, locations, and dates. The team needed enough coverage for three distinct subjects, while still gathering the connective material that would make the combined reel feel intentional.',
            'Scheduling became central to the project. Over the course of a year, TGM and the client worked together to arrange the filming windows needed to capture the campaign as school life happened.',
          ],
        },
      },
      {
        type: 'full-bleed',
        label: 'More than one story',
        title: 'Every part of school life deserves time in the frame.',
        paragraphs: [
          'The individual films make room for the people and programs that define each subject. The campaign gives them a shared visual language without flattening them into the same story.',
        ],
      },
      {
        type: 'film-pair',
        playerSide: 'right',
        layout: 'wide-media',
        film: {
          id: '1225354536',
          hash: '51ff826e0f',
          title: 'Academics',
          label: '02 / Featured film',
          description: 'A campaign film centered on learning and the life around it.',
          thumbnail: 'https://i.vimeocdn.com/video/2199050484-1f48112b49017da304ed12e88fdf43bbe38b26d8b977cfd9d07bde067c213374-d_1920x1080?&r=pad&region=us',
        },
        copy: {
          type: 'section',
          label: 'The approach',
          heading: 'Give each subject its own frame.',
          paragraphs: [
            'TGM brainstormed and proposed a campaign structure with room for each subject to lead: athletics, academics, and the arts each received a dedicated film, while the sizzle reel would provide a broader introduction to the school.',
            'Once the client approved the concept, our team began coordinating the shoots needed to put it in motion. The campaign had a clear system from the start, but the schedule left room for each film to find the moments that made it distinct.',
          ],
          details: ['Campaign concept', 'Shoot coordination', 'Dedicated subject films'],
        },
      },
      {
        type: 'statement',
        before: 'Every subject has a place. ',
        emphasis: 'Every story still belongs together.',
      },
      {
        type: 'film-pair',
        playerSide: 'left',
        layout: 'wide-copy',
        film: {
          id: '1191661277',
          hash: '67ffd0981a',
          title: 'Sizzle Reel',
          label: '03 / Featured film',
          description: 'The combined reel connects the campaign’s core subjects in one concise piece.',
          thumbnail: 'https://i.vimeocdn.com/video/2156731992-37c0250f510acf0bd61bdaf0637f3502fdd3ae6525d14de9bcc8b371bd15cde4-d_1920x1080?&r=pad&region=us',
        },
        copy: {
          type: 'section',
          label: 'The creative work',
          heading: 'Build the campaign over time. Bring it together with purpose.',
          paragraphs: [
            'Working closely with the client, TGM scheduled filming around the specific activities needed for each video. That coordination made it possible to gather footage over time while staying focused on the three core subjects the campaign needed to represent.',
            'The finished series gave athletics, academics, and the arts their own focused moments. The sizzle reel shaped those moments into one concise promotional story for Batesburg-Leesville Schools.',
          ],
          details: ['Year-long production', 'Activity-led shoots', 'Campaign edit'],
        },
      },
      {
        type: 'section',
        label: 'The result',
        heading: 'Four films made to show the whole school.',
        paragraphs: [
          'Batesburg-Leesville Schools now has focused content for athletics, academics, and the arts, alongside a combined reel that showcases all three. The campaign gives the client a flexible way to advertise different parts of school life while keeping the larger story in view.',
        ],
      },
    ],
    closing: {
      label: 'The campaign',
      before: 'More stories',
      emphasis: 'to show.',
      copy: 'A flexible campaign built to keep showing up for the school moments still ahead.',
    },
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
        type: 'full-bleed',
        label: 'Family, on screen',
        title: 'The strongest family stories do not feel performed.',
        paragraphs: [
          'They feel noticed. The small dynamics, familiar spaces, and everyday details do the heavy lifting long before the message arrives.',
        ],
      },
      {
        type: 'film-pair',
        playerSide: 'left',
        film: {
          id: '1204536993',
          hash: '02cf81e62c',
          title: 'The Nest',
          label: '01 / Featured film',
          description: 'One of the finished stories in the Navy Mutual family campaign.',
        },
        copy: {
          type: 'flow-statement',
          label: 'The challenge',
          before: 'Believability lives in ',
          emphasis: 'the details.',
          paragraphs: [
            'A campaign about family depends on people, places, and small visual details that feel credible—not staged. Casting had to meet the client’s criteria, while locations and props had to give every scene a sense of place.',
            'Military wardrobe required especially close coordination. It needed to follow military guidelines and Navy Mutual’s requirements while still looking natural on screen. Across all five films, the stories also had to remain clear, engaging, and concise enough for their commercial format.',
          ],
        },
      },
      {
        type: 'interlude',
        text: 'One more for safety.',
        attribution: '— Tyler, probably',
      },
      {
        type: 'film-pair',
        playerSide: 'right',
        film: {
          id: '1199857515',
          hash: '9419771e0c',
          title: 'Bedtime Drill Sergeant',
          label: '02 / Featured film',
          description: 'A second story shaped around the people and details that make a family feel real.',
        },
        copy: {
          type: 'section',
          label: 'The approach',
          heading: 'Do the homework before the shoot.',
          paragraphs: [
            'We started with light script revisions to improve flow without losing the client’s message. From there, we coordinated casting, locations, wardrobe, props, and filming dates so the production had the right pieces in place before cameras rolled.',
            'The preparation continued into the shot list. Before each shoot, the team studied and practiced the planned coverage, arriving with a shared understanding of the scene, the performance, and the footage the edit would need.',
          ],
          details: ['Script flow', 'Shot planning', 'Production coordination'],
        },
      },
      {
        type: 'full-bleed',
        label: 'On set',
        title: 'A plan for every frame. Room for every real moment.',
        paragraphs: [
          'The best preparation gives a crew a shared plan—and enough confidence to stay present when the human moments are the ones worth keeping.',
        ],
      },
      {
        type: 'film-pair',
        playerSide: 'left',
        film: {
          id: '1181639716',
          hash: '93947cc90d',
          title: 'Home Front',
          label: '03 / Featured film',
          description: 'The campaign continues to grow, one family story at a time.',
        },
        copy: {
          type: 'section',
          label: 'The creative work',
          heading: 'Bring the plan to life. Then shape the story.',
          paragraphs: [
            'On set, the prepared cast, locations, wardrobe, and props gave the crew a practical foundation. The shot list kept everyone aligned around the performances and details each edit would require.',
            'In post, our three editors shaped the footage for pacing, clarity, and commercial-length storytelling. Navy Mutual’s reviews guided the refinements, keeping the finished work close to the client’s vision without losing the human feel of the campaign.',
          ],
          details: ['Production', 'Three-editor post team', 'Client-reviewed revisions'],
        },
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
    closing: {
      label: 'Campaign ongoing',
      before: 'The work',
      emphasis: 'continues.',
      copy: 'More family stories are still taking shape.',
    },
  },
  {
    slug: 'taylor-bmw',
    number: '03',
    client: 'Taylor BMW',
    title: 'A lifestyle story built around the drive.',
    category: 'Automotive · Commercial production',
    image: 'https://i.vimeocdn.com/video/1996170478-ddc01c34ddaaf95c98b4b410583acd8a23fe046cf5bb0856a560ecf0ec03de87-d_1920x1080?&r=pad&region=us',
    summary: 'For BMW Lifestyle, TranterGrey Media developed a high-end commercial from the first concept through the final edit—writing, directing, filming on location, and shaping the finished piece in post.',
    focus: ['Concept and scriptwriting', 'Location production', 'Edit and finish'],
    story: [
      {
        type: 'section',
        label: 'The brief',
        heading: 'One lifestyle story, built around the drive.',
        paragraphs: [
          'For BMW Lifestyle, Taylor BMW needed a polished commercial that would put the vehicle inside a real, aspirational moment—not simply place it in front of the camera.',
          'TGM developed the spot from the initial concept through the final edit, building a visual story where the car belongs naturally in the life around it.',
        ],
        details: ['One 30-second commercial', 'Location production', 'Script through final edit'],
      },
      {
        type: 'film-pair',
        playerSide: 'left',
        film: {
          id: '1068124019',
          hash: '518b536a19',
          title: 'BMW Lifestyle',
          label: '01 / Featured film',
          description: 'A lifestyle-led Taylor BMW commercial, written, directed, filmed, and finished by TGM.',
          thumbnail: 'https://i.vimeocdn.com/video/1996170478-ddc01c34ddaaf95c98b4b410583acd8a23fe046cf5bb0856a560ecf0ec03de87-d_1920x1080?&r=pad&region=us',
        },
        copy: {
          type: 'flow-statement',
          label: 'The challenge',
          before: 'Make the vehicle feel ',
          emphasis: 'part of the story.',
          paragraphs: [
            'The spot had to showcase the BMW without interrupting the life happening around it. Every visual choice needed to carry both the vehicle’s refinement and the ease of the setting.',
            'The commercial needed a clear point of view from the first beat, so the finished film could feel cinematic, specific, and effortless.',
          ],
        },
      },
      {
        type: 'statement',
        before: 'Built with intent. ',
        emphasis: 'Made to feel effortless.',
        ghost: 'Effortless',
      },
      {
        type: 'section',
        label: 'The process',
        heading: 'Write it. Direct it. Shoot it where it belongs.',
        paragraphs: [
          'TGM wrote the spot and planned its visual progression before heading to location. Direction, shot planning, and production coordination kept the performance, environment, and vehicle moving as one piece.',
          'On location, the crew captured the planned story beats and the texture around them. In post, TGM refined the pacing and transitions into a polished commercial with a premium finish.',
        ],
        details: ['Writing and direction', 'Location shoot', 'Editorial finish'],
      },
      {
        type: 'bts-gallery',
        label: 'Behind the scenes / BMW Lifestyle',
        images: [
          { src: '/assets/case-studies/taylor-bmw/bts-water.jpeg', alt: 'Camera operator filming in the water during the BMW Lifestyle location shoot.' },
          { src: '/assets/case-studies/taylor-bmw/bts-location.jpeg', alt: 'The Taylor BMW production team setting up a camera shot on location.' },
          { src: '/assets/case-studies/taylor-bmw/bts-lighting.jpeg', alt: 'Crew member holding a lighting modifier beside a BMW during production.' },
          { src: '/assets/case-studies/taylor-bmw/bts-monitor.jpeg', alt: 'Crew reviewing a camera monitor on the BMW Lifestyle set.' },
        ],
      },
      {
        type: 'section',
        label: 'The result',
        heading: 'One finished spot, built to make the drive feel like a lifestyle.',
        paragraphs: [
          'BMW Lifestyle gives Taylor BMW a polished, lifestyle-led way to show both the vehicle and the feeling that comes with it.',
        ],
      },
    ],
    closing: {
      label: 'Taylor BMW',
      before: 'More roads.',
      emphasis: 'More stories.',
      copy: 'A high-end commercial shaped from concept to final frame.',
    },
  },
];

export function getCaseStudy(slug: string) {
  return caseStudies.find((study) => study.slug === slug);
}
