import { aiErrorText } from "./aiErrors";

describe("aiErrorText", () => {
  test("shows the server's own explanation", () => {
    const e = new Error("The AI account is out of credit. Add credit at console.anthropic.com.");
    expect(aiErrorText(e)).toBe(e.message);
  });

  test("explains a dropped connection in plain words", () => {
    expect(aiErrorText(new TypeError("Failed to fetch"))).toMatch(/Couldn't reach the server/);
    expect(aiErrorText(new TypeError("Load failed"))).toMatch(/Couldn't reach the server/);
  });

  test("falls back when there is no message", () => {
    expect(aiErrorText(undefined)).toBe("The AI analysis failed. Please try again.");
    expect(aiErrorText(new Error(""))).toBe("The AI analysis failed. Please try again.");
  });
});
