import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import nunjucks from "nunjucks";
import path from "node:path";
import logger from "../../commons/logger.js";
import mainPageTemplate from "./index.njk";
import { getCookieValues } from "../../commons/cookie-utilities.js";
import {
  handleGetIdentityFromCredentialStore,
  validateStoredIdentity,
} from "../../domain/stored-identity/stored-identity-validator.js";
import { getSessionDetails } from "../../api/oauth-internal-api.js";
import { redirectToErrorPage } from "../../api/sis-api.js";
import { EVCSError, StoredIdentityValidationError } from "../../commons/errors.js";
import { HttpCodesEnum } from "../../commons/constants.js";
import { extractUserDetails } from "./user-details-content.js";
import translations from "../../../locales/en/translation.json" with { type: "json" };

const govukFrontendDistribution = path.join(path.dirname(require.resolve("govuk-frontend/package.json")), "dist");
const nunjucksEnvironment = nunjucks.configure([
  process.env.LAMBDA_TASK_ROOT || "",
  govukFrontendDistribution,
  path.join(govukFrontendDistribution, "../.."),
]);

nunjucksEnvironment.addFilter("GDSDate", (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

export type ConfirmDetailsQueryStringParameters = {
  redirect_uri: string;
  client_id: string;
  state: string;
};

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { redirect_uri, client_id, state } = event.queryStringParameters as ConfirmDetailsQueryStringParameters;
  if (!redirect_uri || !state || !client_id) {
    throw new Error("One or more required query string parameters are undefined or empty");
  }

  const domainName = process.env.DOMAIN_NAME || "";
  const sessionId = getCookieValues(event)?.get("identity_reuse_service_session");
  try {
    if (!sessionId) {
      logger.error("Session cookie not found");
      return redirectToErrorPage(domainName);
    }

    const { storageAccessToken, subject } = await getSessionDetails(sessionId);

    if (!storageAccessToken) {
      logger.error("No storageAccessToken returned from session endpoint");
      return redirectToErrorPage(domainName);
    }

    const identityResponse = await handleGetIdentityFromCredentialStore(`Bearer ${storageAccessToken}`, subject);
    const { kidValid, signatureValid, isValid, storedIdentityRecord } = await validateStoredIdentity(identityResponse);

    if (!kidValid || !signatureValid || !isValid || !storedIdentityRecord) {
      logger.error("Record validation failed for existing user", { kidValid, signatureValid, isValid });
      return {
        statusCode: 500,
        body: "",
      };
    }
    const userDetails = extractUserDetails(storedIdentityRecord);

    return {
      statusCode: 200,
      body: nunjucksEnvironment.render(mainPageTemplate, {
        assetPath: "./assets",
        rootPath: ".",
        redirect_uri,
        state,
        client_id,
        userDetails,
        translations,
        govukRebrand: true,
        errorPageUrl: `https://${domainName}/error/unrecoverable`,
      }),
      headers: {
        "content-type": "text/html",
      },
    };
  } catch (error) {
    if (error instanceof EVCSError && error.statusCode === HttpCodesEnum.NOT_FOUND) {
      logger.error("No identity record found in EVCS");
      return redirectToErrorPage(domainName);
    }
    if (error instanceof StoredIdentityValidationError) {
      return redirectToErrorPage(domainName);
    }
    logger.error(`Error in lambdaHandler event: ${error}`);
    return {
      statusCode: 500,
      body: "",
    };
  }
};
