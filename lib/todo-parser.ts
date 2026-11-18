export type Token = { start: number; end: number; value: string };
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function calendarDate(year:number,month:number,day:number) {
  const date=new Date(year,month-1,day,12);
  return year>=2000 && year<=2099 && date.getFullYear()===year && date.getMonth()===month-1 && date.getDate()===day ? localDate(date) : '';
}
function parseDate(text:string,now:Date) {
  const normalized=text.toLowerCase().trim();
  let match=normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(match)return calendarDate(+match[1],+match[2],+match[3]);
  match=normalized.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
  if(match){
    let year=match[3]?(match[3].length===2?2000:0)+Number(match[3]):now.getFullYear();
    let value=calendarDate(year,+match[1],+match[2]);
    if(!match[3] && value && value<localDate(now))value=calendarDate(++year,+match[1],+match[2]);
    return value;
  }
  match=normalized.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if(match){
    const month=months.findIndex(m=>m===match![1] || m.slice(0,3)===match![1])+1;
    if(!month)return '';
    let year=match[3]?+match[3]:now.getFullYear();
    let value=calendarDate(year,month,+match[2]);
    if(!match[3] && value && value<localDate(now))value=calendarDate(++year,month,+match[2]);
    return value;
  }
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  if(normalized==='today')return localDate(date);
  if(normalized==='tomorrow'){date.setDate(date.getDate()+1);return localDate(date);}
  match=normalized.match(/^in (\d{1,3}) days?$/);
  if(match){date.setDate(date.getDate()+Number(match[1]));return localDate(date);}
  const dayText=normalized.replace(/^next /,'');
  const day=weekdays.findIndex(d=>d===dayText || d.slice(0,3)===dayText);
  if(day>=0){let offset=(day-date.getDay()+7)%7;if(normalized.startsWith('next ') && offset===0)offset=7;date.setDate(date.getDate()+offset);return localDate(date);}
  return '';
}
const datePattern=/(?:\b(?:no later than|due(?:\s+on|\s+by)?|before|by|on|deadline(?:\s+is|\s+on)?|until)\s*:?\s+)(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-](?:\d{4}|\d{2}))?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|today|tomorrow|in \d{1,3} days?|(?:next )?(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))(?![\w/\-])/gi;

/** Conservative, local parsing: invalid/multiple dates stay literal. US month/day convention. */
export function parseTodo(text:string,members:string[]=[],now=new Date()) {
  const dates=[...text.matchAll(datePattern)];
  let date:Token|undefined;
  if(dates.length===1){const match=dates[0],value=parseDate(match[1],now);if(value)date={start:match.index!,end:match.index!+match[0].length,value};}
  const mentions:Token[]=[];
  const unmatched:Token[]=[];
  const names=[...members].sort((a,b)=>b.length-a.length);
  const pattern=/(^|\s)@(?:\[([^\]\n]+)\]|"([^"\n]+)"|([\p{L}][\p{L}\p{N}_'-]*))/gu;
  for(const match of text.matchAll(pattern)){
    const start=match.index!+match[1].length;
    let value=(match[2] || match[3] || match[4]).trim(),end=match.index!+match[0].length;
    if(match[4]){
      const rest=text.slice(start+1);
      const known=names.find(name=>rest.slice(0,name.length).toLowerCase()===name.toLowerCase() && (!rest[name.length] || /[\s,.;!?]/.test(rest[name.length])));
      if(known){value=known;end=start+1+known.length;}
      else if(text[end] && !/[\s,.;!?]/.test(text[end]))continue;
    }
    const canonical=names.find(name=>name.toLowerCase()===value.toLowerCase());
    if(canonical && canonical.length<=120)mentions.push({start,end,value:canonical});
    else unmatched.push({start,end,value});
  }
  const tokens=[...(date?[date]:[]),...mentions].sort((a,b)=>b.start-a.start);
  let title=text;
  for(const token of tokens)title=title.slice(0,token.start)+title.slice(token.end);
  title=title.replace(/\s+/g,' ').trim();
  return {title,date,mentions,unmatched,assignee:[...new Set(mentions.map(m=>m.value))].join(', ')};
}
