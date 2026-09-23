export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

export function parseJson(raw: string | undefined): Json | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return undefined;
  }
}

export function field(value: Json | undefined, key: string): Json | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value[key];
}
