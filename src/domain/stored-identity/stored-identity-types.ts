import {
  IdentityVectorOfTrust,
  JWTClass,
  PersonWithIdentityClass,
  PostalAddressClass,
} from "@govuk-one-login/data-vocab/credentials.js";

export type StoredIdentityValidationResult = {
  kidValid: boolean;
  signatureValid: boolean;
  isValid: boolean;
  storedIdentityRecord: StoredIdentityRecord;
};

export interface StoredIdentityRecord<VotT extends string = IdentityVectorOfTrust> extends JWTClass {
  sub: string;
  credentials: string[];
  vot: VotT;
  max_vot?: IdentityVectorOfTrust;
  vtm: string;
  claims: StoredIdentityClaims;
}

export interface StoredIdentityClaims {
  "https://vocab.account.gov.uk/v1/coreIdentity": PersonWithIdentityClass;
  "https://vocab.account.gov.uk/v1/address": PostalAddressClass[];
}

export type StoredIdentityVectorOfTrust = IdentityVectorOfTrust | "P0";

export const isStoredIdentityRecord = (value: unknown): value is StoredIdentityRecord => {
  if (typeof value !== "object" || value === null) return false;

  const storedIdentityRecordObject = value as Record<string, unknown>;
  if (
    typeof storedIdentityRecordObject.sub !== "string" ||
    !Array.isArray(storedIdentityRecordObject.credentials) ||
    typeof storedIdentityRecordObject.vot !== "string" ||
    typeof storedIdentityRecordObject.vtm !== "string" ||
    typeof storedIdentityRecordObject.claims !== "object" ||
    storedIdentityRecordObject.claims === null
  ) {
    return false;
  }

  const claims = storedIdentityRecordObject.claims as Record<string, unknown>;
  const coreIdentity = claims["https://vocab.account.gov.uk/v1/coreIdentity"] as Record<string, unknown> | undefined;

  if (typeof coreIdentity !== "object" || coreIdentity === null) return false;
  if (!Array.isArray(coreIdentity.name) || coreIdentity.name.length === 0) return false;
  if (!Array.isArray(coreIdentity.birthDate) || coreIdentity.birthDate.length === 0) return false;
  return Array.isArray(claims["https://vocab.account.gov.uk/v1/address"]);
};
