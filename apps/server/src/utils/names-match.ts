const tokens = (name: string): string[] =>
  name.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);

export function namesMatch(a: string, b: string): boolean {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  const shared = [...ta].filter((t) => tb.has(t)).length;

  // At least two words in common, and one name fully contained in the other
  return shared >= 2 && (shared === ta.size || shared === tb.size);
}