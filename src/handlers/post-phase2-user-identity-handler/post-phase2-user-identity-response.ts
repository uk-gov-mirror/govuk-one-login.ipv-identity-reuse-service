import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { StoredIdentityJWT, StoredIdentityVectorOfTrust } from "../../domain/stored-identity/stored-identity-types.js";

export type UserIdentityResponse = {
  content: StoredIdentityJWT<StoredIdentityVectorOfTrust>;
  isValid: boolean;
  expired: boolean;
  vot: IdentityVectorOfTrust;
  kidValid: boolean;
  signatureValid: boolean;
};
