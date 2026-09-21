import logger from "../../commons/logger.js";
import { hasNbfExpired, normaliseToStartOfDay } from "../../commons/date-utilities.js";
import { IdentityCheckCredentialJWTClass } from "@govuk-one-login/data-vocab/credentials.js";
import { VerifiableCredentialJWT, isIdentityCheckCredential } from "./verifiable-credential-types.js";

export const hasDrivingPermit = (vc: IdentityCheckCredentialJWTClass): boolean => {
  const drivingPermits = vc.vc?.credentialSubject?.drivingPermit;
  return Array.isArray(drivingPermits) && drivingPermits.length > 0;
};

export const isDcmawVcSuccessful = (vc: IdentityCheckCredentialJWTClass): boolean => {
  const evidenceItems = vc.vc?.evidence;
  if (!evidenceItems || evidenceItems.length === 0) {
    return false;
  }

  return evidenceItems.every((evidenceItem) => {
    if (!evidenceItem.strengthScore) {
      return false;
    }

    if (!evidenceItem.validityScore) {
      return false;
    }

    const checkDetails = evidenceItem.checkDetails;
    if (!checkDetails || checkDetails.length === 0) {
      return false;
    }

    return checkDetails.some((detail) => {
      const biometricLevel = detail.biometricVerificationProcessLevel;
      return biometricLevel !== undefined && biometricLevel > 0;
    });
  });
};

export const getDcmawDrivingPermitVc = (
  vcBundle: VerifiableCredentialJWT[],
  dcmawIssuers: string[]
): IdentityCheckCredentialJWTClass | undefined => {
  const matchingVcs = vcBundle.filter((vc): vc is IdentityCheckCredentialJWTClass => {
    if (!vc.iss || !dcmawIssuers.includes(vc.iss)) return false;
    if (!isIdentityCheckCredential(vc)) return false;

    return hasDrivingPermit(vc) && isDcmawVcSuccessful(vc);
  });

  if (matchingVcs.length > 1) {
    logger.warn("Multiple successful DCMAW driving permit VCs found, using the first");
  }

  return matchingVcs.at(0);
};

export const wasDrivingLicenceExpiredAtIssuance = (vc: IdentityCheckCredentialJWTClass): boolean => {
  const drivingPermits = vc.vc?.credentialSubject?.drivingPermit;
  if (!drivingPermits || drivingPermits.length === 0) {
    return false;
  }

  if (drivingPermits.length > 1) {
    logger.warn("Multiple driving permits found in DCMAW VC, using the first");
  }

  const [drivingPermit] = drivingPermits;
  if (!drivingPermit.expiryDate || !vc.nbf) {
    logger.warn("Missing expiryDate or nbf in driving permit VC");
    return false;
  }

  const licenceExpiryDay = normaliseToStartOfDay(new Date(drivingPermit.expiryDate));
  const vcIssuanceDay = normaliseToStartOfDay(new Date(vc.nbf * 1000));

  return licenceExpiryDay < vcIssuanceDay;
};

export const hasDrivingLicenceExpired = (
  vcBundle: VerifiableCredentialJWT[],
  dcmawIssuers: string[],
  validityPeriodDays: number
): boolean | undefined => {
  const dcmawVc = getDcmawDrivingPermitVc(vcBundle, dcmawIssuers);
  if (!dcmawVc) {
    return;
  }

  if (!dcmawVc.nbf) {
    logger.warn("DCMAW VC missing nbf");
    return false;
  }

  if (!wasDrivingLicenceExpiredAtIssuance(dcmawVc)) {
    return false;
  }

  const expired = hasNbfExpired(dcmawVc.nbf, validityPeriodDays);
  if (expired) {
    logger.info("Driving licence expiry check returned expired");
  }
  return expired;
};
