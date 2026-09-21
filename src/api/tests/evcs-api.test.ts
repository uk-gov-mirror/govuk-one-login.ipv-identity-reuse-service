import { IdentityCheckCredentialJWTClass } from "@govuk-one-login/data-vocab/credentials.js";
import { getDefaultJwtHeader, sign } from "../../../shared-test/jwt-utilities.js";
import { EVCSIdentityResponse, parseCurrentVerifiableCredentials, VerifiableCredentialObject } from "../evcs-api.js";
import { describe, it, expect } from "vitest";

describe("parseCurrentVerifiableCredentials", () => {
  it("should return verifiable credentials with CURRENT state only", async () => {
    const identityResponse: EVCSIdentityResponse = {
      si: {
        vc: "jwtString",
        metadata: undefined,
        unsignedVot: "P2",
      },
      vcs: [
        await createVerifiableCredentialWithState("iss1", "CURRENT"),
        await createVerifiableCredentialWithState("iss2", "CURRENT"),
        await createVerifiableCredentialWithState("iss3", "HISTORIC"),
        await createVerifiableCredentialWithState("iss4", "PENDING_RETURN"),
      ],
    };

    const result = parseCurrentVerifiableCredentials(identityResponse);
    expect(result).toHaveLength(2);
    expect(result.map((vc) => vc.iss)).toContain("iss1");
    expect(result.map((vc) => vc.iss)).toContain("iss2");
  });
});

const createVerifiableCredentialWithState = async (
  issuer: string,
  state: string
): Promise<VerifiableCredentialObject> => {
  return {
    state: state,
    vc: await sign(getDefaultJwtHeader(), getVerifiableCredential(issuer)),
    metadata: undefined,
  };
};

const getVerifiableCredential = (issuer: string): IdentityCheckCredentialJWTClass => {
  return {
    iss: issuer,
    nbf: 1234,
    sub: "user1234",
    vc: {
      evidence: [],
    },
  };
};
