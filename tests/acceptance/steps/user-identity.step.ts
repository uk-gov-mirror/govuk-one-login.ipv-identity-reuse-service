import { Given, When } from "@cucumber/cucumber";
import { sisPostUserIdentity } from "./utils/sis-api";
import { getBearerToken } from "./utils/get-bearer-token";
import assert from "assert";
import { WorldDefinition } from "./base-verbs.step";
import { evcsPostIdentity } from "./utils/evcs-api";
import { JWTHeaderParameters, JWTPayload } from "jose";
import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials";
import { getDefaultJwtHeader, sign, renderDid } from "../../../shared-test/jwt-utils";

Given<WorldDefinition>("I have a user without a stored identity", async function () {
  this.bearerToken = await getBearerToken(this.userId);
});

Given<WorldDefinition>(
  "the user has a stored identity, with VOT {string}",
  async function (vot: IdentityVectorOfTrust) {
    await createStoredIdentityWithVot.call(this, vot);
  }
);

Given<WorldDefinition>(
  "the user has a stored identity, with VOT {string} in the VC and stored with {string}",
  async function (signedVot: IdentityVectorOfTrust, unsignedVot: IdentityVectorOfTrust) {
    await createStoredIdentityWithVot.call(this, signedVot, unsignedVot);
  }
);

Given<WorldDefinition>(
  "the user has a stored identity, with VOT {string}, max_vox {string} in the VC and stored with {string}",
  async function (signedVot: IdentityVectorOfTrust, maxVot: IdentityVectorOfTrust, unsignedVot: IdentityVectorOfTrust) {
    await createStoredIdentityWithVot.call(this, signedVot, unsignedVot, maxVot);
  }
);

Given<WorldDefinition>(
  "I have a user with a Stored Identity, with VOT {string} and {int} credentials",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function (vot: string, credentials: number) {
    const header: JWTHeaderParameters = getDefaultJwtHeader("ES256", renderDid(this.testDidController, this.keyId));
    const payload: JWTPayload = {
      sub: this.userId,
      iss: "http://api.example.com",
      vot,
    };
    const jwt = await sign(header, payload, true);

    const result = await evcsPostIdentity(
      this,
      this.userId,
      {
        vot: vot as never as IdentityVectorOfTrust,
        jwt,
      },
      this.bearerToken || ""
    );

    assert.equal(result.status, 202);

    this.bearerToken = await getBearerToken(this.userId);
  }
);

Given<WorldDefinition>("I have a user with a Stored Identity, and an invalid signature", async function () {
  const header: JWTHeaderParameters = getDefaultJwtHeader("ES256", renderDid(this.testDidController, this.keyId));
  const payload: JWTPayload = {
    sub: this.userId,
    iss: "http://api.example.com",
    vot: "P2",
  };
  const jwt = await sign(header, payload);
  const result = await evcsPostIdentity(
    this,
    this.userId,
    {
      vot: "P2",
      jwt,
    },
    this.bearerToken || ""
  );

  assert.equal(result.status, 202);

  this.bearerToken = await getBearerToken(this.userId);
});

Given<WorldDefinition>(
  "I have a user with a Stored Identity, with {string} kid",

  async function (status: string) {
    let kid: string;
    if (status == "no") {
      kid = "";
    } else if (status == "invalid") {
      kid = "invalid_kid";
    } else if (status == "forbidden") {
      kid = "did:web:forbidden.controller#f5fe5d2a-9eb6-4819-8c46-723e3a21565a";
    } else {
      throw new Error("Invalid kid config");
    }

    const header: JWTHeaderParameters = getDefaultJwtHeader("ES256", kid);
    const payload: JWTPayload = {
      sub: this.userId,
      iss: "http://api.example.com",
      vot: "P2",
    };
    const jwt = await sign(header, payload, true);

    const result = await evcsPostIdentity(
      this,
      this.userId,
      {
        vot: "P2" as never as IdentityVectorOfTrust,
        jwt,
      },
      this.bearerToken || ""
    );

    assert.equal(result.status, 202);

    this.bearerToken = await getBearerToken(this.userId);
  }
);

When<WorldDefinition>("I make a request for the users identity with a VTR {string}", async function (vtr: string) {
  this.userIdentityPostResponse = await sisPostUserIdentity(
    {
      vtr: vtr.split(",").map((s) => s.trim()),
      govukSigninJourneyId: this.govukSigninJourneyId,
    },
    this.bearerToken
  );
});

When<WorldDefinition>("I make a request for the users identity with invalid Authorization header", async function () {
  this.userIdentityPostResponse = await sisPostUserIdentity(
    {
      vtr: this.requestedVtr,
      govukSigninJourneyId: this.govukSigninJourneyId,
    },
    "Blah blah"
  );
});

When<WorldDefinition>("I make a request for the users identity without Authorization header", async function () {
  this.userIdentityPostResponse = await sisPostUserIdentity({
    vtr: this.requestedVtr,
    govukSigninJourneyId: this.govukSigninJourneyId,
  });
});

async function createStoredIdentityWithVot(
  this: WorldDefinition,
  signedVot: IdentityVectorOfTrust,
  unsignedVot?: IdentityVectorOfTrust,
  maxVot?: IdentityVectorOfTrust
) {
  const header: JWTHeaderParameters = getDefaultJwtHeader("ES256", renderDid(this.testDidController, this.keyId));

  const allCredentialSignatures = this.credentialJwts.map((jwt) => jwt.split(".").at(-1));

  const payload: JWTPayload = {
    sub: this.userId,
    iss: "http://api.example.com",
    credentials: allCredentialSignatures,
    vot: signedVot,
    ...(maxVot && { max_vot: maxVot }),
  };
  const jwt = await sign(header, payload, true);

  const result = await evcsPostIdentity(
    this,
    this.userId,
    {
      vot: unsignedVot || signedVot,
      jwt,
    },
    this.bearerToken || ""
  );

  assert.equal(result.status, 202);

  this.bearerToken = await getBearerToken(this.userId);
}
