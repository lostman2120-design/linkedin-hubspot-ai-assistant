import type { SellerContext } from "@linkedin-hubspot-ai/shared";

export type SellerContextTemplateId =
  | "b2b-saas-founder"
  | "hubspot-consultant"
  | "revops-agency"
  | "sales-agency"
  | "freelance-consultant";

export type SellerContextTemplate = {
  id: SellerContextTemplateId;
  name: string;
  description: string;
  context: SellerContext;
};

export const SELLER_CONTEXT_TEMPLATES: SellerContextTemplate[] = [
  {
    id: "b2b-saas-founder",
    name: "B2B SaaS Founder",
    description: "For founder-led sales into small and mid-market B2B teams.",
    context: {
      productOrServiceName: "B2B SaaS product",
      productOrServiceDescription: "A focused SaaS product that helps B2B teams improve a measurable workflow without adding heavy implementation work.",
      targetOutcome: "Help the buyer save time, improve visibility, and reach a useful business outcome faster.",
      mainDifferentiators: "Founder-led support, fast setup, focused scope, and a practical workflow that fits existing tools.",
      proofPoints: "Use only verified customer results, product usage, or founder experience that you can support.",
      pricingContext: "Share pricing only when relevant; lead with the workflow and expected value.",
      preferredCta: "Ask whether the workflow is relevant and offer a short product walkthrough.",
      claimsAllowed: "Describe verified capabilities, setup speed, workflow fit, and supported outcomes.",
      claimsToAvoid: "Guaranteed revenue, guaranteed replies, invented customer results, or unsupported ROI claims.",
      brandVoice: "Founder-to-founder, concise, curious, and practical.",
      competitorsOrAlternatives: "Manual work, spreadsheets, point solutions, and the buyer's current software stack.",
      compatibilityContext: "Position the product as a focused addition that can coexist with the buyer's current systems."
    }
  },
  {
    id: "hubspot-consultant",
    name: "HubSpot Consultant",
    description: "For HubSpot consultants, freelancers, and agencies selling CRM improvement work.",
    context: {
      productOrServiceName: "HubSpot consulting and implementation",
      productOrServiceDescription: "Hands-on HubSpot consulting for CRM setup, lifecycle design, pipeline structure, automation, reporting, data quality, and team adoption.",
      targetOutcome: "Give the client a cleaner HubSpot portal, reliable reporting, and a sales process the team can actually follow.",
      mainDifferentiators: "Practical implementation, senior consultant access, clear documentation, and improvements built around the client's existing sales motion.",
      proofPoints: "Use verified portal projects, certifications, migration experience, adoption improvements, or reporting outcomes only.",
      pricingContext: "Project, retainer, or audit-based pricing depending on portal complexity and implementation scope.",
      preferredCta: "Offer a short HubSpot workflow review or ask which CRM process is creating the most friction.",
      claimsAllowed: "HubSpot setup, cleanup, automation, reporting, enablement, and process design that you directly provide.",
      claimsToAvoid: "Guaranteed pipeline growth, guaranteed attribution accuracy, or claims that HubSpot alone fixes the sales process.",
      brandVoice: "Experienced, diagnostic, calm, and helpful rather than promotional.",
      competitorsOrAlternatives: "Internal RevOps work, another HubSpot partner, ad hoc portal fixes, spreadsheets, or leaving the current setup unchanged.",
      compatibilityContext: "Work within the client's current HubSpot portal and alongside their sales, marketing, service, and finance tools."
    }
  },
  {
    id: "revops-agency",
    name: "RevOps Agency",
    description: "For agencies improving revenue process, systems, data, and reporting.",
    context: {
      productOrServiceName: "Revenue operations services",
      productOrServiceDescription: "RevOps strategy and implementation across CRM architecture, lifecycle stages, lead routing, pipeline governance, reporting, and go-to-market systems.",
      targetOutcome: "Create a more reliable revenue process with clearer ownership, cleaner data, and better pipeline visibility.",
      mainDifferentiators: "Cross-functional process design, hands-on systems work, documented governance, and an operator-led delivery team.",
      proofPoints: "Use verified process improvements, reporting gains, implementation milestones, and client references only.",
      pricingContext: "Usually sold as a diagnostic project, implementation engagement, or ongoing RevOps retainer.",
      preferredCta: "Ask about the most costly handoff or reporting gap and offer a short diagnostic conversation.",
      claimsAllowed: "Process, system, data, reporting, and enablement improvements supported by the engagement scope.",
      claimsToAvoid: "Guaranteed revenue growth, instant attribution, or assumptions about the prospect's current tech stack.",
      brandVoice: "Strategic, evidence-led, direct, and collaborative.",
      competitorsOrAlternatives: "Internal RevOps hires, specialist contractors, CRM agencies, and disconnected point solutions.",
      compatibilityContext: "Improve and connect the client's existing go-to-market stack instead of forcing a full replacement."
    }
  },
  {
    id: "sales-agency",
    name: "Sales Agency",
    description: "For outsourced prospecting, SDR, appointment-setting, or sales development services.",
    context: {
      productOrServiceName: "B2B sales development service",
      productOrServiceDescription: "Managed B2B prospecting and sales development that combines account research, human-reviewed outreach, qualification, and CRM discipline.",
      targetOutcome: "Help clients create a consistent qualified-conversation pipeline without building the full SDR function internally.",
      mainDifferentiators: "Focused ICP research, quality control, transparent reporting, and messaging adapted to the client's market.",
      proofPoints: "Use verified meeting quality, campaign learning, client references, or pipeline contribution data only.",
      pricingContext: "Monthly engagement or campaign pricing based on market, volume, channel mix, and qualification depth.",
      preferredCta: "Ask whether outbound capacity or message quality is the bigger constraint and offer a short campaign review.",
      claimsAllowed: "Describe the actual research, outreach, qualification, and reporting process provided.",
      claimsToAvoid: "Guaranteed meetings, guaranteed revenue, spam-like volume claims, or pretending outreach is fully automated.",
      brandVoice: "Human, commercially aware, concise, and low pressure.",
      competitorsOrAlternatives: "Internal SDR hiring, founder-led outbound, lead databases, automation tools, and other agencies.",
      compatibilityContext: "Operate inside or alongside the client's existing CRM, sales process, and account ownership rules."
    }
  },
  {
    id: "freelance-consultant",
    name: "Freelance Consultant",
    description: "For independent specialists selling advisory and hands-on delivery.",
    context: {
      productOrServiceName: "Independent consulting service",
      productOrServiceDescription: "Specialist advisory and implementation support for a clearly defined business, operational, or go-to-market problem.",
      targetOutcome: "Help the client make a better decision and implement a practical improvement with senior hands-on support.",
      mainDifferentiators: "Direct specialist access, flexible scope, fast communication, and advice tied to implementation reality.",
      proofPoints: "Use verified experience, relevant projects, credentials, and outcomes that can be explained honestly.",
      pricingContext: "Hourly, fixed-scope, workshop, or monthly advisory pricing depending on the engagement.",
      preferredCta: "Ask one diagnostic question and offer a short conversation if the issue is current.",
      claimsAllowed: "Specific expertise, services, experience, and verified outcomes.",
      claimsToAvoid: "Guaranteed transformation, invented authority, or assumptions about budget and urgency.",
      brandVoice: "Expert, personal, thoughtful, and concise.",
      competitorsOrAlternatives: "Internal ownership, larger agencies, other freelancers, software, or delaying the project.",
      compatibilityContext: "Work with the client's existing team, tools, and partners with minimal disruption."
    }
  }
];

export function getSellerContextTemplate(id: SellerContextTemplateId): SellerContextTemplate {
  const template = SELLER_CONTEXT_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error("Seller Context template was not found.");
  }

  return template;
}

export function sellerContextHasValues(context: SellerContext): boolean {
  return Object.values(context).some((value) => value.trim().length > 0);
}
