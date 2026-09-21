import {
  getDcmawDrivingPermitVc,
  hasDrivingPermit,
  isDcmawVcSuccessful,
  wasDrivingLicenceExpiredAtIssuance,
  hasDrivingLicenceExpired,
} from "../driving-licence-expiry-service.js";
import { IdentityCheckCredentialJWTClass } from "@govuk-one-login/data-vocab/credentials.js";
import { VerifiableCredentialJWT } from "../verifiable-credential-types.js";
import logger from "../../../commons/logger.js";
import { vi, describe, it, beforeEach, afterEach, expect } from "vitest";

vi.mock("../../../commons/logger");

const DCMAW_ISSUER = ["https://www.review-b.dev.account.gov.uk"];
const FRAUD_ISSUER = "https://review-f.dev.account.gov.uk";

describe("driving-licence-expiry-service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe("getDcmawDrivingPermitVc", () => {
    it("should return successful DCMAW driving permit VC", () => {
      const dcmawVc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const result = getDcmawDrivingPermitVc([dcmawVc], DCMAW_ISSUER);
      expect(result).toBeDefined();
      expect(result?.iss).toBe(DCMAW_ISSUER[0]);
    });

    it("should return undefined when no DCMAW VC", () => {
      const fraudVc = createFraudVc();
      const result = getDcmawDrivingPermitVc([fraudVc], DCMAW_ISSUER);
      expect(result).toBeUndefined();
    });

    it("should return undefined when VC issuer not in DCMAW list", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const result = getDcmawDrivingPermitVc([vc], ["https://other-issuer.gov.uk"]);
      expect(result).toBeUndefined();
    });

    it("should skip DCMAW passport VC and find DCMAW driving permit VC", () => {
      const passportVc = createDcmawPassportVc();
      const drivingPermitVc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const result = getDcmawDrivingPermitVc([passportVc, drivingPermitVc], DCMAW_ISSUER);
      expect(result).toBe(drivingPermitVc);
    });

    it("should skip failed DCMAW VC and find successful one", () => {
      const failedVc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      failedVc.vc.evidence = [
        {
          strengthScore: 0,
          validityScore: 2,
          checkDetails: [
            {
              biometricVerificationProcessLevel: 2,
            },
          ],
        },
      ];

      const successfulVc = createDcmawDrivingPermitVc("2026-09-01", "2026-03-01T10:00:00Z");
      const result = getDcmawDrivingPermitVc([failedVc, successfulVc], DCMAW_ISSUER);
      expect(result).toBe(successfulVc);
    });

    it("should return undefined when all DCMAW driving permit VCs are failed", () => {
      const failedVc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      failedVc.vc.evidence = [{ strengthScore: 0, validityScore: 0 }];
      const result = getDcmawDrivingPermitVc([failedVc], DCMAW_ISSUER);
      expect(result).toBeUndefined();
    });

    it("should warn when multiple successful DCMAW driving permit VCs are present", () => {
      const vc1 = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const vc2 = createDcmawDrivingPermitVc("2026-09-01", "2026-03-01T10:00:00Z");
      const result = getDcmawDrivingPermitVc([vc1, vc2], DCMAW_ISSUER);
      expect(result).toBe(vc1);
      expect(logger.warn).toHaveBeenCalledWith("Multiple successful DCMAW driving permit VCs found, using the first");
    });

    it("should not warn when only one successful DCMAW driving permit VC is present", () => {
      const dcmawVc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const fraudVc = createFraudVc();
      getDcmawDrivingPermitVc([dcmawVc, fraudVc], DCMAW_ISSUER);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("isDcmawVcSuccessful", () => {
    it("should return true when VC has valid strength, validity and biometric scores", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      expect(isDcmawVcSuccessful(vc)).toBe(true);
    });

    it("should return false when strengthScore is 0", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 0,
          validityScore: 2,
          checkDetails: [{ biometricVerificationProcessLevel: 2 }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when strengthScore is missing", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          validityScore: 2,
          checkDetails: [{ biometricVerificationProcessLevel: 2 }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when validityScore is 0", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 3,
          validityScore: 0,
          checkDetails: [{ biometricVerificationProcessLevel: 2 }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when validityScore is missing", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 3,
          checkDetails: [{ biometricVerificationProcessLevel: 2 }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when biometricVerificationProcessLevel is 0", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 3,
          validityScore: 2,
          checkDetails: [{ biometricVerificationProcessLevel: 0 }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when biometricVerificationProcessLevel is missing", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 3,
          validityScore: 2,
          checkDetails: [{ checkMethod: "bvr" }],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when checkDetails is empty", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 3,
          validityScore: 2,
          checkDetails: [],
        },
      ];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });

    it("should return false when evidence is empty", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [];
      expect(isDcmawVcSuccessful(vc)).toBe(false);
    });
  });

  describe("hasDrivingPermit", () => {
    it("should return true when VC has drivingPermit", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      expect(hasDrivingPermit(vc)).toBe(true);
    });

    it("should return false when VC has just a passport instead", () => {
      const vc = createDcmawPassportVc();
      expect(hasDrivingPermit(vc)).toBe(false);
    });

    it("should return false when VC has empty drivingPermit array", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      vc.vc.credentialSubject!.drivingPermit = [];
      expect(hasDrivingPermit(vc)).toBe(false);
    });
  });

  describe("wasDrivingLicenceExpiredAtIssuance", () => {
    it("should return false when licence was valid at VC issuance", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(false);
    });

    it("should return true when licence was expired at VC issuance", () => {
      const vc = createDcmawDrivingPermitVc("2026-01-15", "2026-02-01T10:00:00Z");
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(true);
    });

    it("should return false when licence expires on same day as VC issuance", () => {
      const vc = createDcmawDrivingPermitVc("2026-02-01", "2026-02-01T10:00:00Z");
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(false);
    });

    it("should return false when no drivingPermit", () => {
      const vc = createDcmawPassportVc();
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(false);
    });

    it("should return false when missing expiryDate", () => {
      const vc = createDcmawDrivingPermitVc("2026-06-01", "2026-02-01T10:00:00Z");
      const firstPermit = vc.vc.credentialSubject!.drivingPermit![0];
      delete (firstPermit as { expiryDate?: string }).expiryDate;
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(false);
    });

    it("should return false when missing nbf", () => {
      const vc = createDcmawDrivingPermitVc("2026-01-15", "2026-02-01T10:00:00Z");
      (vc as { nbf?: number }).nbf = undefined;
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(false);
    });

    it("should warn when multiple driving permits are present and use the first", () => {
      const vc = createDcmawDrivingPermitVc("2026-01-15", "2026-02-01T10:00:00Z");
      vc.vc.credentialSubject!.drivingPermit!.push({
        expiryDate: "2030-01-01",
        personalNumber: "98765",
        issuedBy: "DVLA",
      });
      expect(wasDrivingLicenceExpiredAtIssuance(vc)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith("Multiple driving permits found in DCMAW VC, using the first");
    });
  });

  describe("hasDrivingLicenceExpired", () => {
    it("should return undefined when no DCMAW driving permit VC", () => {
      const fraudVc = createFraudVc();
      const result = hasDrivingLicenceExpired([fraudVc], DCMAW_ISSUER, 180);
      expect(result).toBeUndefined();
    });

    it("should return undefined when DCMAW VC uses passport", () => {
      const vc = createDcmawPassportVc();
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBeUndefined();
    });

    it("should return undefined when DCMAW driving permit VC is failed", () => {
      const vc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      vc.vc.evidence = [
        {
          strengthScore: 0,
          validityScore: 2,
          checkDetails: [{ biometricVerificationProcessLevel: 2 }],
        },
      ];
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBeUndefined();
    });

    it("should return false when licence was valid at issuance", () => {
      const vc = createDcmawDrivingPermitVc("2026-12-01", "2026-02-01T10:00:00Z");
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBe(false);
    });

    it("should return false when licence was expired at issuance but VC within 180 days", () => {
      vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
      const vc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBe(false);
    });

    it("should return true when licence was expired at issuance and VC older than 180 days", () => {
      vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
      const vc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBe(true);
    });

    it("should return false when DCMAW VC is missing nbf", () => {
      const vc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      (vc as { nbf?: number }).nbf = undefined;
      const result = hasDrivingLicenceExpired([vc], DCMAW_ISSUER, 180);
      expect(result).toBe(false);
    });

    it("should skip failed DCMAW VC and check successful one", () => {
      vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
      const failedVc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      failedVc.vc.evidence = [{ strengthScore: 0, validityScore: 0 }];

      const successfulVc = createDcmawDrivingPermitVc("2026-01-01", "2026-02-01T10:00:00Z");
      const result = hasDrivingLicenceExpired([failedVc, successfulVc], DCMAW_ISSUER, 180);
      expect(result).toBe(true);
    });
  });
});

function createDcmawDrivingPermitVc(
  licenceExpiryDate: string,
  vcIssuanceTime: string
): IdentityCheckCredentialJWTClass {
  return {
    iss: "https://www.review-b.dev.account.gov.uk",
    nbf: Math.floor(new Date(vcIssuanceTime).getTime() / 1000),
    sub: "test-user-123",
    vc: {
      type: ["VerifiableCredential", "IdentityCheckCredential"],
      evidence: [
        {
          strengthScore: 3,
          validityScore: 2,
          checkDetails: [{ checkMethod: "vcrypt" }, { checkMethod: "bvr", biometricVerificationProcessLevel: 2 }],
        },
      ],
      credentialSubject: {
        drivingPermit: [
          {
            expiryDate: licenceExpiryDate,
            personalNumber: "123",
            issuedBy: "DVLA",
          },
        ],
      },
    },
  } as IdentityCheckCredentialJWTClass;
}

function createDcmawPassportVc(): IdentityCheckCredentialJWTClass {
  return {
    iss: "https://www.review-b.dev.account.gov.uk",
    nbf: Math.floor(Date.now() / 1000),
    sub: "test-user-123",
    vc: {
      type: ["VerifiableCredential", "IdentityCheckCredential"],
      evidence: [
        {
          strengthScore: 4,
          validityScore: 2,
          checkDetails: [{ checkMethod: "vcrypt" }, { checkMethod: "bvr", biometricVerificationProcessLevel: 2 }],
        },
      ],
      credentialSubject: {
        passport: [
          {
            documentNumber: "123",
            expiryDate: "2030-01-01",
            icaoIssuerCode: "GBR",
          },
        ],
      },
    },
  } as IdentityCheckCredentialJWTClass;
}

function createFraudVc(): VerifiableCredentialJWT {
  return {
    iss: FRAUD_ISSUER,
    nbf: Math.floor(Date.now() / 1000),
    sub: "test-user-123",
    vc: {
      type: ["VerifiableCredential", "IdentityCheckCredential"],
      evidence: [{ checkDetails: [{ checkMethod: "data" }] }],
    },
  } as VerifiableCredentialJWT;
}
