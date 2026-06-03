import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildEnglishOnlyInstruction,
  buildLeadScoringInstruction,
  containsNonEnglishScript,
  createEnglishOnlyGeneratedDmSchema,
  createEnglishOnlyProfileAnalysisSchema,
  validateEnglishOnlyStrings
} from "../services/openaiPromptRules.js";

describe("OpenAI English-only prompt rules", () => {
  it("tells the model not to mirror the profile language", () => {
    const instruction = buildEnglishOnlyInstruction();

    expect(instruction).toContain("natural English");
    expect(instruction).toContain("Never mirror the LinkedIn profile language");
    expect(instruction).toContain("Japanese");
    expect(instruction).toContain("US SaaS");
  });

  it("detects Japanese scripts in AI-generated output", () => {
    expect(containsNonEnglishScript("Thanks for sharing your RevOps work.")).toBe(false);
    expect(containsNonEnglishScript("営業チームの成長について拝見しました。")).toBe(true);
  });

  it("rejects non-English scripts inside generated response objects", () => {
    const schema = z
      .object({
        message: z.string(),
        warnings: z.array(z.string())
      })
      .superRefine((value, context) => validateEnglishOnlyStrings(value, context));

    expect(
      schema.safeParse({
        message: "Hi Ken, noticed your work leading GTM operations.",
        warnings: []
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({
        message: "こんにちは Ken, noticed your GTM work.",
        warnings: []
      }).success
    ).toBe(false);
  });

  it("accepts English analysis output for a Japanese LinkedIn profile fixture", () => {
    const japaneseProfileContext = {
      fullName: "佐藤 健",
      headline: "営業企画マネージャー | SaaS事業の成長支援",
      profileUrl: "https://www.linkedin.com/in/example/",
      visibleTextSample: "営業組織の生産性向上とRevOpsに取り組んでいます。"
    };
    const schema = createEnglishOnlyProfileAnalysisSchema();

    expect(containsNonEnglishScript(JSON.stringify(japaneseProfileContext))).toBe(true);
    expect(
      schema.safeParse({
        leadScore: 78,
        persona: "Revenue operations leader at a SaaS company",
        painPoints: ["Scaling sales productivity", "Improving pipeline visibility"],
        icebreaker: "I noticed your focus on improving sales team productivity.",
        recommendedAction: "Send a short, helpful note about operational efficiency.",
        confidence: "medium"
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({
        leadScore: 78,
        persona: "SaaS企業の営業企画マネージャー",
        painPoints: ["営業生産性の向上"],
        icebreaker: "営業組織の生産性向上への取り組みを拝見しました。",
        recommendedAction: "短いメッセージを送る。",
        confidence: "medium"
      }).success
    ).toBe(false);
  });

  it("preserves meaningful non-zero lead scores in analysis validation", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const parsed = schema.parse({
      leadScore: 74,
      persona: "Sales operations leader",
      painPoints: ["Improving pipeline quality"],
      icebreaker: "I noticed your focus on sales productivity.",
      recommendedAction: "Send a concise note with a practical RevOps angle.",
      confidence: "medium"
    });

    expect(parsed.leadScore).toBe(74);
  });

  it("includes scoring guidance and a generic B2B fallback when target customer settings are missing", () => {
    const instruction = buildLeadScoringInstruction(false);

    expect(instruction).toContain("Do not default to 0");
    expect(instruction).toContain("80-100 = strong fit");
    expect(instruction).toContain("generic B2B SaaS sales relevance fallback");
  });

  it("accepts English DM output for a Japanese LinkedIn profile fixture", () => {
    const japaneseProfileContext = {
      fullName: "田中 美咲",
      headline: "カスタマーサクセス責任者",
      profileUrl: "https://www.linkedin.com/in/example-cs/"
    };
    const schema = createEnglishOnlyGeneratedDmSchema(300);

    expect(containsNonEnglishScript(JSON.stringify(japaneseProfileContext))).toBe(true);
    expect(
      schema.safeParse({
        message:
          "Hi Misaki, I noticed your customer success leadership work. I like how you focus on practical team outcomes, and I would be glad to connect.",
        personalizationScore: 84,
        spamRisk: "low",
        warnings: []
      }).success
    ).toBe(true);

    expect(
      schema.safeParse({
        message: "こんにちは Misaki, your customer success work stood out.",
        personalizationScore: 73,
        spamRisk: "medium",
        warnings: []
      }).success
    ).toBe(false);
  });
});
