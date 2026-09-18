import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { StoredIdentityJWT } from "../../domain/stored-identity/stored-identity-types.js";

export type StoredIdentityVectorOfTrust = IdentityVectorOfTrust | "P0";

export type UserIdentityResponse = {
  content: StoredIdentityJWT<StoredIdentityVectorOfTrust>;
  isValid: boolean;
  expired: boolean;
  vot: IdentityVectorOfTrust;
  kidValid: boolean;
  signatureValid: boolean;
};
