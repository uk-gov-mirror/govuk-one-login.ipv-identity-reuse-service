import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import * as configuration from "../../../commons/configuration.js";
import * as DidResolutionService from "../../../api/did-resolution-api.js";
import { publicKeyJwk, getDefaultJwtHeader } from "../../../../shared-test/jwt-utilities.js";
import {
  createCredentialStoreIdentityResponse,
  createInvalidIdentityCheckCredentialJWT,
  createSignedIdentityCheckCredentialJWT,
} from "../../../../shared-test/evcs-api-utilities.js";
import { validateCryptography, validateStoredIdentity } from "../stored-identity-validator.js";
import { getJwtSignature } from "../../../commons/jwt-utilities.js";
import { EVCSIdentityResponse } from "../../../api/evcs-api.js";

const mockEVCSResponse = (response: EVCSIdentityResponse) => {
  (globalThis.fetch as Mock) = vi.fn().mockResolvedValue(
    Response.json(response, {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
};

const ALLOWED_CONTROLLER = "api.identity.dev.account.gov.uk";
const FRAUD_ISSUER = "fraudCRI";
const PASSPORT_ISSUER = "passportCRI";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(configuration, "getConfiguration").mockResolvedValue({
    controllerAllowList: [ALLOWED_CONTROLLER],
  } as never);
  vi.spyOn(DidResolutionService, "getPublicKeyJwkForKid").mockResolvedValue(publicKeyJwk);
  vi.spyOn(DidResolutionService, "isValidDidWeb").mockReturnValue(true);
  vi.spyOn(DidResolutionService, "getDidWebController").mockReturnValue(ALLOWED_CONTROLLER);
});

describe("validateCryptography", () => {
  it("returns kidValid & signatureValid true for a valid SI VC", async () => {
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([]);
    const result = await validateCryptography(getDefaultJwtHeader().kid!, mockEVCSData);
    expect(result).toEqual({ kidValid: true, signatureValid: true });
  });

  it("kidValid false when DID is not valid did:web", async () => {
    vi.spyOn(DidResolutionService, "isValidDidWeb").mockReturnValue(false);
    const { mockEVCSData } = await createCredentialStoreIdentityResponse(
      [],
      getDefaultJwtHeader("ES256", "did:invalid-did")
    );
    mockEVCSResponse(mockEVCSData);

    const result = await validateCryptography(getDefaultJwtHeader("ES256", "did:invalid-did").kid!, mockEVCSData);

    expect(result).toEqual({ kidValid: false, signatureValid: false });
  });

  it("kidValid false when controller is not allow-listed", async () => {
    vi.spyOn(DidResolutionService, "isValidDidWeb").mockReturnValue(true);
    vi.spyOn(DidResolutionService, "getDidWebController").mockReturnValue("DISALLOWED.CONTROLLER");

    const header = getDefaultJwtHeader("ES256", "did:web:DISALLOWED.CONTROLLER#f5fe5d2a-9eb6-4819-8c46-723e3a21565a");
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([], header);

    const result = await validateCryptography(header.kid!, mockEVCSData);
    expect(result).toEqual({ kidValid: false, signatureValid: false });
  });

  it("signatureValid false when the SI VC signature does not verify", async () => {
    const incorrectlySignedIdentity = createInvalidIdentityCheckCredentialJWT(PASSPORT_ISSUER);
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([], getDefaultJwtHeader());
    mockEVCSData.si.vc = incorrectlySignedIdentity;
    mockEVCSResponse(mockEVCSData);

    const result = await validateCryptography(getDefaultJwtHeader().kid!, mockEVCSData);
    expect(result).toEqual({ kidValid: true, signatureValid: false });
  });
});

describe("validateStoredIdentity", () => {
  it("isValid set to true when SI credentials match returned VC signatures", async () => {
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([
      await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER),
      await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER),
    ]);

    const result = await validateStoredIdentity(mockEVCSData);
    expect(result).toMatchObject({ kidValid: true, signatureValid: true, isValid: true });
    expect(result.storedIdentityJwt).toBeDefined();
  });

  it("isValid is false when a stored identity record is missing a signature", async () => {
    const passportCredential = await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER);
    const fraudCredential = await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER);
    const fraudCredentialSignature = getJwtSignature(fraudCredential)!;

    const credentials = [passportCredential, fraudCredential];
    const credentialSignaturesMissingOne = [fraudCredentialSignature];

    const { mockEVCSData } = await createCredentialStoreIdentityResponse(
      credentials,
      getDefaultJwtHeader(),
      credentialSignaturesMissingOne
    );
    const result = await validateStoredIdentity(mockEVCSData);

    expect(result).toMatchObject({ kidValid: true, signatureValid: true, isValid: false });
  });

  it("isValid is false when a stored identity record contains an extra signature", async () => {
    const passportCredential = await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER);
    const fraudCredential = await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER);
    const passportCredentialSignature = getJwtSignature(passportCredential)!;
    const fraudCredentialSignature = getJwtSignature(fraudCredential)!;

    const credentials = [passportCredential];
    const credentialSignaturesExtraOne = [passportCredentialSignature, fraudCredentialSignature];

    const { mockEVCSData } = await createCredentialStoreIdentityResponse(
      credentials,
      getDefaultJwtHeader(),
      credentialSignaturesExtraOne
    );

    const result = await validateStoredIdentity(mockEVCSData);

    expect(result).toMatchObject({ kidValid: true, signatureValid: true, isValid: false });
  });
});
