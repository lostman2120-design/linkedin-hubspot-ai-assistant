import { describe, expect, it } from "vitest";
import { splitFullName } from "../utils/name.js";

describe("splitFullName", () => {
  it("splits first and last name", () => {
    expect(splitFullName("Avery Johnson")).toEqual({ firstName: "Avery", lastName: "Johnson" });
  });

  it("keeps compound last names", () => {
    expect(splitFullName("Mary Ann Smith")).toEqual({ firstName: "Mary", lastName: "Ann Smith" });
  });

  it("uses Unknown when the name is unavailable", () => {
    expect(splitFullName("Unable to extract this field")).toEqual({ firstName: "Unknown" });
  });
});

