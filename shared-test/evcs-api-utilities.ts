import { JWTHeaderParameters } from "jose";
import { getDefaultJwtHeader, sign } from "./jwt-utilities.js";
import { EVCSIdentityResponse } from "../src/api/evcs-api.js";

const CURRENT = "CURRENT";

const DEFAULT_CLAIMS = {
  "https://vocab.account.gov.uk/v1/coreIdentity": {
    name: [
      {
        nameParts: [
          { type: "GivenName", value: "Test" },
          { type: "FamilyName", value: "User" },
        ],
      },
    ],
    birthDate: [{ value: "1990-01-01" }],
  },
  "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
};

export const createStoredIdentityRecord = (...credentialSignatures: string[]) => {
  const base = { sub: "user-sub", vot: "P2", vtm: "https://oidc.account.gov.uk/trustmark", claims: DEFAULT_CLAIMS };
  return credentialSignatures.length > 0 ? { ...base, credentials: credentialSignatures } : base;
};

export const createSignedIdentityCheckCredentialJWT = async (issuer: string, nbfDate?: string): Promise<string> => {
  const nbf = Math.floor((nbfDate ? new Date(nbfDate).getTime() : Date.now()) / 1000);
  return await sign(getDefaultJwtHeader(), {
    iss: issuer,
    nbf,
    sub: "sdf",
    vc: { evidence: [{}], type: ["VerifiableCredential", "IdentityCheckCredential"] },
  });
};

export const createCredentialStoreIdentityResponseWithStates = async (
  credentialsAndStates: { signedVc: string; state: string }[],
  header: JWTHeaderParameters = getDefaultJwtHeader(),
  forcedCredentialSignatures?: string[]
): Promise<{ mockEVCSData: EVCSIdentityResponse; credentialSignatures: string[] }> => {
  const vcs = credentialsAndStates.map((c) => ({ state: c.state, vc: c.signedVc, metadata: undefined }));
  const credentialSignatures =
    forcedCredentialSignatures ?? credentialsAndStates.map((c) => c.signedVc.split(".").at(2)!);
  const storedIdentity = createStoredIdentityRecord(...credentialSignatures);
  return {
    mockEVCSData: { si: { vc: await sign(header, storedIdentity), metadata: undefined, unsignedVot: "P3" }, vcs },
    credentialSignatures,
  };
};

export const createCredentialStoreIdentityResponse = async (
  signedVcs: string[],
  header: JWTHeaderParameters = getDefaultJwtHeader(),
  forcedCredentialSignatures?: string[]
) =>
  createCredentialStoreIdentityResponseWithStates(
    signedVcs.map((vc) => ({ signedVc: vc, state: CURRENT })),
    header,
    forcedCredentialSignatures
  );

export const createInvalidIdentityCheckCredentialJWT = (issuer: string, nbfDate?: string): string => {
  const nbf = Math.floor((nbfDate ? new Date(nbfDate).getTime() : Date.now()) / 1000);
  const headers = getDefaultJwtHeader();
  const jwt = {
    headers: headers,
    body: {
      iss: issuer,
      nbf,
      sub: "sdf",
    },
  };

  return jwt + "aaa";
};
