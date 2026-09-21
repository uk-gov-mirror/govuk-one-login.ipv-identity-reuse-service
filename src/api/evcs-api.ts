import { getConfiguration, getServiceApiKey } from "../commons/configuration.js";
import { VerifiableCredentialJWT } from "../domain/verifiable-credential/verifiable-credential-jwt.js";
import { getJwtBody } from "../commons/jwt-utilities.js";
import logger from "../commons/logger.js";
import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";

export const getIdentityFromEVCS = async (authorizationToken: string): Promise<Response> => {
  const configuration = await getConfiguration();
  const apiKey = await getServiceApiKey();

  logger.info("Retrieving identity");

  return await fetch(`${configuration.evcsApiUrl}/identity`, {
    method: "GET",
    headers: {
      Authorization: authorizationToken,
      ...(apiKey && { "x-api-key": apiKey }),
    },
  });
};

export const invalidateIdentityInEVCS = async (userId: string): Promise<Response> => {
  const configuration = await getConfiguration();
  const apiKey = await getServiceApiKey();

  logger.info("Invalidating identity");

  return await fetch(`${configuration.evcsApiUrl}/identity/invalidate`, {
    method: "POST",
    body: JSON.stringify({ userId: userId }),
    headers: {
      ...(apiKey && { "x-api-key": apiKey }),
    },
  });
};

export const parseCurrentVerifiableCredentials = (
  identityResponse: EVCSIdentityResponse
): VerifiableCredentialJWT[] => {
  return identityResponse.vcs
    .filter((encodedVcWithState) => encodedVcWithState.state === "CURRENT")
    .map((encodedVcWithState) => getJwtBody<VerifiableCredentialJWT>(encodedVcWithState.vc));
};

export type EVCSIdentityResponse = {
  si: StoredIdentityObject;
  vcs: VerifiableCredentialObject[];
  afterKey?: string;
};

interface StoredIdentityObject {
  vc: string;
  metadata: Metadata | string | undefined;
  unsignedVot: IdentityVectorOfTrust;
}

export interface VerifiableCredentialObject {
  state: string;
  vc: string;
  metadata: Metadata | string | undefined;
  signature?: string;
}

interface Metadata {
  [key: string]: unknown;
}

export type EVCSErrorResponse = {
  message: string;
};
export const isEVCSErrorResponse = (message: unknown): message is EVCSErrorResponse =>
  !!message && typeof message === "object" && (message as Record<string, never>).message;
