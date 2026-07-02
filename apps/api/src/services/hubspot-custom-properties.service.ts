import type { HubSpotPropertyEnsureResult } from "./hubspot.service.js";
import {
  LHA_CONTACT_PROPERTY_DEFINITIONS,
  type HubSpotContactProperties,
  type HubSpotContactPropertyDefinition
} from "../utils/hubspotMapping.js";

type HubSpotCustomPropertyClient = {
  ensureContactProperties(definitions: HubSpotContactPropertyDefinition[]): Promise<HubSpotPropertyEnsureResult>;
  updateContactWithProperties(contactId: string, properties: HubSpotContactProperties): Promise<string>;
};

export type OptionalHubSpotPropertySyncResult = {
  updated: boolean;
  warnings: string[];
};

export async function saveOptionalHubSpotCustomProperties(
  client: HubSpotCustomPropertyClient,
  contactId: string,
  properties: HubSpotContactProperties
): Promise<OptionalHubSpotPropertySyncResult> {
  if (!Object.keys(properties).length) {
    return { updated: false, warnings: [] };
  }

  const propertySetup = await client.ensureContactProperties(LHA_CONTACT_PROPERTY_DEFINITIONS);
  const failedLhaProperties = new Set(propertySetup.failed.map((item) => item.property));
  const warnings = propertySetup.failed.map((item) => `${item.property}: ${item.message}`);
  const writableProperties = Object.fromEntries(
    Object.entries(properties).filter(([property]) => !failedLhaProperties.has(property))
  );

  if (!Object.keys(writableProperties).length) {
    return { updated: false, warnings };
  }

  try {
    await client.updateContactWithProperties(contactId, writableProperties);
    return { updated: true, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "HubSpot custom property update failed.";
    const failedProperties = Object.keys(writableProperties);
    console.warn("[hubspot-contact] Contact saved, but optional custom property update failed.", {
      properties: failedProperties
    });
    return {
      updated: false,
      warnings: [...warnings, ...failedProperties.map((property) => `${property}: ${message}`)]
    };
  }
}
