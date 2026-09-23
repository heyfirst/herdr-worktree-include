export function splitNul(text: string): string[] {
  return text.split("\0").filter((s) => s.length > 0);
}
