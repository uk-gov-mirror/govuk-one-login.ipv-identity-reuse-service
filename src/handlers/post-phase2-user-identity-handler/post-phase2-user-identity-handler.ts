import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { auditIdentityRecordRead, auditIdentityRecordReturned } from "../../commons/audit.js";
import { getConfiguration } from "../../commons/configuration.js";
import { HttpCodesEnum } from "../../commons/constants.js";
import { getJwtBody } from "../../commons/jwt-utilities.js";
import logger from "../../commons/logger.js";
import { EVCSIdentityResponse, parseCurrentVerifiableCredentials } from "../../api/evcs-api.js";
import { calculateVot } from "../../identity-reuse/calculate-vot.js";
import { getFraudVc } from "../../identity-reuse/fraud-check-service.js";
import { hasIdentityExpired } from "../../identity-reuse/identity-expiry-service.js";
import { VerifiableCredentialJWT } from "../../identity-reuse/verifiable-credential-jwt.js";
import { UserIdentityRequest } from "./post-phase2-user-identity-request.js";
import { StoredIdentityJWT } from "../../domain/stored-identity/stored-identity-types.js";
import { StoredIdentityVectorOfTrust, UserIdentityResponse } from "./post-phase2-user-identity-response.js";
import { getProperty } from "../../commons/case-insensitive-header-utilities.js";
import {
  getUserIdFromJwt,
  handleGetIdentityFromCredentialStore,
  createErrorResponse,
  createAndLogErrorResponse,
  validateStoredIdentity,
} from "../../domain/stored-identity/stored-identity-validator.js";
import { EVCSError } from "../../commons/errors.js";
import { VotEnum } from "@govuk-one-login/event-catalogue/SIS_STORED_IDENTITY_READ.js";
import { ResponseBody } from "@govuk-one-login/event-catalogue/SIS_STORED_IDENTITY_RETURNED.js";

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const request = event.body ? (JSON.parse(event.body) as UserIdentityRequest) : undefined;

  logger.addContext(context);

  if (!request) {
    logger.error("Request body is invalid");
    return createErrorResponse(HttpCodesEnum.BAD_REQUEST);
  }

  logger.appendKeys({
    govuk_signin_journey_id: request.govukSigninJourneyId,
  });

  const authorisation = getProperty(event?.headers, "authorization");

  if (!authorisation) {
    logger.error("Authorisation header was not included in request");
    return createErrorResponse(HttpCodesEnum.UNAUTHORIZED);
  }

  let subject: string;
  try {
    subject = getUserIdFromJwt(authorisation);
  } catch {
    logger.error("Error whilst decoding Bearer token body");
    return createErrorResponse(HttpCodesEnum.UNAUTHORIZED);
  }

  try {
    const identityResponse = await handleGetIdentityFromCredentialStore(
      authorisation,
      subject,
      request.govukSigninJourneyId
    );
    const response = await createSuccessResponse(identityResponse, request.vtr, subject, request.govukSigninJourneyId);

    return { statusCode: HttpCodesEnum.OK, body: JSON.stringify(response) };
  } catch (error) {
    if (error instanceof EVCSError) {
      return await createAndLogErrorResponse(error.statusCode, error.userId, error.journeyId);
    }
    logger.error("Error retrieving user identity", { error });
    return await createAndLogErrorResponse(HttpCodesEnum.INTERNAL_SERVER_ERROR, subject, request.govukSigninJourneyId);
  }
};

const createSuccessResponse = async (
  identityResponse: EVCSIdentityResponse,
  vtr: IdentityVectorOfTrust[],
  userId: string,
  govukSigninJourneyId: string
): Promise<UserIdentityResponse> => {
  const configuration = await getConfiguration();
  const currentVcs: VerifiableCredentialJWT[] = parseCurrentVerifiableCredentials(identityResponse);
  const fraudVc = getFraudVc(currentVcs, configuration.fraudIssuer);
  const content = getJwtBody<StoredIdentityJWT>(identityResponse.si.vc);
  const { kidValid, signatureValid, isValid } = await validateStoredIdentity(identityResponse);
  const vot: StoredIdentityVectorOfTrust = calculateVot(content, identityResponse.si.unsignedVot, vtr);
  const vtm = `https://oidc.account.gov.uk/trustmark`;
  const maxVot = (content.max_vot || identityResponse.si.unsignedVot) as VotEnum;

  await auditIdentityRecordRead(
    {
      retrieval_outcome: "success",
      max_vot: maxVot,
      ...(fraudVc ? { timestamp_fraud_check_nbf: fraudVc?.nbf } : {}),
    },
    {
      stored_identity_jwt: identityResponse.si.vc,
    },
    userId,
    govukSigninJourneyId
  );

  delete content.max_vot;

  const expired = hasIdentityExpired(currentVcs, configuration);

  const successResponse: UserIdentityResponse = {
    content: { ...content, vot, vtm },
    vot: maxVot,
    isValid: isValid,
    expired,
    kidValid,
    signatureValid,
  };

  await auditIdentityRecordReturned(
    {
      response_outcome: "returned",
      is_valid: successResponse.isValid,
      expired: successResponse.expired,
      vot: successResponse.content.vot as VotEnum,
    },
    {
      response_body: JSON.stringify(successResponse) as ResponseBody,
    },
    userId,
    govukSigninJourneyId
  );

  return successResponse;
};
