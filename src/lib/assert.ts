export function assertExhausted(value: never): never {
  throw new Error(`unhandled case: ${JSON.stringify(value)}`);
}
