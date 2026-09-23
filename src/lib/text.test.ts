import { expect, test } from "bun:test";
import { splitNul } from "./text";

test("splitNul drops empty entries", () => {
  expect(splitNul("a\0b\0\0c\0")).toEqual(["a", "b", "c"]);
  expect(splitNul("")).toEqual([]);
});
