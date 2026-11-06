/**
 * Splits text into chunks of at most `max` characters, preferring to break on
 * blank lines (section boundaries), then single newlines, then hard splits.
 * Inline markup never spans lines, so breaking on newlines keeps it valid.
 */
export function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];

  // Tokenise into pieces that each fit, remembering the separator before them.
  const pieces: { text: string; sep: string }[] = [];
  text.split(/\n{2,}/).forEach((section, si) => {
    const sectionSep = si === 0 ? "" : "\n\n";
    if (section.length <= max) {
      pieces.push({ text: section, sep: sectionSep });
      return;
    }
    section.split("\n").forEach((line, li) => {
      const lineSep = li === 0 ? sectionSep : "\n";
      if (line.length <= max) {
        pieces.push({ text: line, sep: lineSep });
        return;
      }
      for (let i = 0; i < line.length; i += max) {
        pieces.push({ text: line.slice(i, i + max), sep: i === 0 ? lineSep : "" });
      }
    });
  });

  const out: string[] = [];
  let current = "";
  for (const p of pieces) {
    if (!current) current = p.text;
    else if (current.length + p.sep.length + p.text.length <= max) current += p.sep + p.text;
    else {
      out.push(current);
      current = p.text;
    }
  }
  if (current) out.push(current);
  return out;
}
