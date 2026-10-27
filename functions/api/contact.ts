type Database = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
    };
  };
};

type Context = {
  request: Request;
  env: { TG_DATA: Database };
};

type Inquiry = {
  name: string;
  email: string;
  business: string;
  focus: string;
  timeline: string;
  availabilityDates: string[];
  availabilityTime: string;
  message: string;
};

const limited = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const meetingTimes = new Set(['Morning', 'Afternoon', 'Evening', 'Surprise me']);

function validInquiry(value: unknown): Inquiry | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (limited(body.website, 120)) return { name: '', email: '', business: '', focus: '', timeline: '', availabilityDates: [], availabilityTime: '', message: '' };
  const inquiry = {
    name: limited(body.name, 100),
    email: limited(body.email, 180),
    business: limited(body.business, 140),
    focus: limited(body.focus, 80),
    timeline: limited(body.timeline, 80),
    availabilityDates: Array.isArray(body.availabilityDates) ? body.availabilityDates.filter((date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 14) : [],
    availabilityTime: limited(body.availabilityTime, 40),
    message: limited(body.message, 2000),
  };
  const validAvailability = (!inquiry.availabilityDates.length && !inquiry.availabilityTime)
    || (inquiry.availabilityDates.length > 0 && meetingTimes.has(inquiry.availabilityTime));
  if (!inquiry.name || !inquiry.business || !inquiry.focus || !inquiry.timeline || !validAvailability || !inquiry.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) return null;
  return inquiry;
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const inquiry = validInquiry(body);
    if (!inquiry) return Response.json({ error: 'Please complete the required fields and try again.' }, { status: 400 });

    // Silently acknowledge the hidden honeypot field without storing spam.
    if (!inquiry.name) return Response.json({ ok: true });

    await env.TG_DATA.prepare(
      `INSERT INTO contact_inquiries (id, received_at, name, email, business, focus, timeline, availability_dates, availability_time, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      inquiry.name,
      inquiry.email,
      inquiry.business,
      inquiry.focus,
      inquiry.timeline,
      JSON.stringify(inquiry.availabilityDates),
      inquiry.availabilityTime,
      inquiry.message,
    ).run();

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'We could not save that note. Please try again.' }, { status: 500 });
  }
}
