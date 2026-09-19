import {
  IdentityVectorOfTrust,
  JWTClass,
  PersonWithIdentityClass,
  PostalAddressClass,
} from "@govuk-one-login/data-vocab/credentials.js";

export interface StoredIdentityClaims {
  "https://vocab.account.gov.uk/v1/coreIdentity": PersonWithIdentityClass;
  "https://vocab.account.gov.uk/v1/address": PostalAddressClass[];
}

export interface StoredIdentityJWT<VotT extends string = IdentityVectorOfTrust> extends JWTClass {
  sub: string;
  credentials: string[];
  vot: VotT;
  max_vot?: IdentityVectorOfTrust;
  vtm: string;
  claims: StoredIdentityClaims;
}

export type StoredIdentityVectorOfTrust = IdentityVectorOfTrust | "P0";

export const isStoredIdentityJWT = (value: unknown): value is StoredIdentityJWT => {
  if (typeof value !== "object" || value === null) return false;

  const storedIdentityJWTObject = value as Record<string, unknown>;
  if (
    typeof storedIdentityJWTObject.sub !== "string" ||
    !Array.isArray(storedIdentityJWTObject.credentials) ||
    typeof storedIdentityJWTObject.vot !== "string" ||
    typeof storedIdentityJWTObject.vtm !== "string" ||
    typeof storedIdentityJWTObject.claims !== "object" ||
    storedIdentityJWTObject.claims === null
  ) {
    return false;
  }

  const claims = storedIdentityJWTObject.claims as Record<string, unknown>;
  const coreIdentity = claims["https://vocab.account.gov.uk/v1/coreIdentity"] as Record<string, unknown> | undefined;

  if (typeof coreIdentity !== "object" || coreIdentity === null) return false;
  if (!Array.isArray(coreIdentity.name) || coreIdentity.name.length === 0) return false;
  if (!Array.isArray(coreIdentity.birthDate) || coreIdentity.birthDate.length === 0) return false;
  return Array.isArray(claims["https://vocab.account.gov.uk/v1/address"]);
};
