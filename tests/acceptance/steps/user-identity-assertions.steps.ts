import { Then } from "@cucumber/cucumber";
import { WorldDefinition } from "./base-verbs.step";
import assert from "assert";
import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials";

Then<WorldDefinition>("the status code should be {int}", function (statusCode: number) {
  assert.ok(this.userIdentityPostResponse);
  assert.equal(this.userIdentityPostResponse.statusCode, statusCode);
});

Then<WorldDefinition>("the error should be {string}", function (error: string) {
  assert.ok(this.userIdentityPostResponse);
  assert.equal(this.userIdentityPostResponse.body.error, error);
});

Then<WorldDefinition>("the error description should be {string}", function (errorDescription: string) {
  assert.ok(this.userIdentityPostResponse);
  assert.equal(this.userIdentityPostResponse.body.error_description, errorDescription);
});

Then<WorldDefinition>("the stored identity should be returned", function () {
  // Build expected credentials array from all credentials
  const expectedCredentials = this.credentialJwts.map((jwt) => jwt.split(".").at(-1));

  assert.deepEqual(
    {
      ...this.userIdentityPostResponse?.body,
      content: {
        ...this.userIdentityPostResponse?.body?.content,
        vot: undefined,
      },
      vot: undefined,
      isValid: undefined,
      expired: undefined,
    },
    {
      content: {
        sub: this.userId,
        iss: "http://api.example.com",
        credentials: expectedCredentials,
        vot: undefined,
        vtm: "https://oidc.account.gov.uk/trustmark",
      },
      vot: undefined,
      isValid: undefined,
      expired: undefined,
      kidValid: true,
      signatureValid: true,
    }
  );
});

Then("the stored identity content.vot should be {string}", function (vot: string) {
  assert.equal(this.userIdentityPostResponse?.body?.content?.vot, vot);
});

Then("the stored identity VOT should be {string}", function (vot: string) {
  assert.equal(this.userIdentityPostResponse?.body?.vot, vot);
});

Then("the stored identity isValid field is {boolean}", function (isValid: boolean) {
  assert.equal(this.userIdentityPostResponse?.body?.isValid, isValid);
});

Then("the stored identity expired field is {boolean}", function (isExpired: boolean) {
  assert.equal(this.userIdentityPostResponse?.body?.expired, isExpired);
});

Then("the stored identity should have VOT {string}", function (vot: IdentityVectorOfTrust) {
  assert.equal(this.userIdentityPostResponse?.body?.content.vot, vot);
});

Then("the stored identity should have max_vot", function () {
  assert.ifError(this.userIdentityPostResponse?.body?.content.max_vot);
  assert.ifError(this.userIdentityPostResponse?.body?.max_vot);
});

Then<WorldDefinition>("the untrusted stored identity should be returned", function () {
  assert.deepEqual(
    {
      ...this.userIdentityPostResponse?.body,
      content: {
        ...this.userIdentityPostResponse?.body?.content,
        vot: undefined,
      },
      vot: undefined,
      isValid: undefined,
      kidValid: undefined,
      signatureValid: undefined,
    },
    {
      content: {
        sub: this.userId,
        iss: "http://api.example.com",
        vot: undefined,
        vtm: "https://oidc.account.gov.uk/trustmark",
      },
      vot: undefined,
      isValid: undefined,
      expired: true,
      kidValid: undefined,
      signatureValid: undefined,
    }
  );
});

Then("the stored identity kidValid field is {boolean}", function (kidValid: boolean) {
  assert.equal(this.userIdentityPostResponse?.body?.kidValid, kidValid);
});

Then("the stored identity signatureValid field is {boolean}", function (signatureValid: boolean) {
  assert.equal(this.userIdentityPostResponse?.body?.signatureValid, signatureValid);
});
