// A conservative punctuation signal, not an inference about whether an answer exists.
export function hasCommentQuestion(html: string): boolean {
 const plain = html
  .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, ' ')
  .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, ' ')
  .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:nbsp|amp|quot|apos);|&#(?:39|34);/gi, ' ')
  .replace(/&#(?:0*63|x0*3f);/gi, '?')
  .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ');
 return /[\p{L}\p{N}][^?]*\?/u.test(plain);
}
