import {
  IdentityCheckCredentialJWTClass,
  RiskAssessmentCredentialJWTClass,
  SecurityCheckCredentialJWTClass,
} from "@govuk-one-login/data-vocab/credentials.js";

export type VerifiableCredentialJWT =
  IdentityCheckCredentialJWTClass | RiskAssessmentCredentialJWTClass | SecurityCheckCredentialJWTClass;

export const isIdentityCheckCredential = (vc: VerifiableCredentialJWT): vc is IdentityCheckCredentialJWTClass => {
  const vcTypes = vc.vc?.type;

  if (!Array.isArray(vcTypes)) {
    return false;
  }

  return vcTypes.includes("IdentityCheckCredential");
};
