import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { SQSEvent, SQSRecord } from "aws-lambda";
import { InterventionCodeEnum } from "@govuk-one-login/event-catalogue/SIS_IDENTITY_RECORD_INVALIDATED.js";

import { MetricDimension, MetricName } from "../../commons/metric-enum.js";
import { isAisMessage, AisMessage } from "./ais-message.js";

import { getConfiguration, type Configuration } from "../../commons/configuration.js";
import { isStringWithLength } from "../../commons/string-utilities.js";
import logger from "../../commons/logger.js";
import { auditIdentityRecordInvalidated } from "../../commons/audit.js";
import { invalidateIdentityInEVCS, isEVCSErrorResponse } from "../../api/evcs-api.js";

const metrics = new Metrics();

export const handler = async (event: SQSEvent): Promise<void> => {
  const records = parseSQSRecords(event.Records);

  logger.info(`Event received containing ${records.length} messages`);
  metrics.addMetric(MetricName.MessagesReceived, MetricUnit.Count, records.length);

  const config = await getConfiguration();

  try {
    for (const record of records) {
      if (!isInterventionRecord(record, config)) {
        logger.info(`Message does not contain relevant intervention code`);
        continue;
      }

      await invalidateUser(record.user_id, record.intervention_code!);
    }
  } finally {
    metrics.publishStoredMetrics();
  }
};

const invalidateUser = async (userId: string, interventionCode: InterventionCodeEnum) => {
  try {
    const response = await invalidateIdentityInEVCS(userId);

    if (response.ok) {
      logger.info(`Successfully invalidated user identity`);
      const invalidateMetric = metrics.singleMetric();
      invalidateMetric.addDimension(MetricDimension.InterventionCode, interventionCode);
      invalidateMetric.addMetric(MetricName.IdentityInvalidatedOnIntervention, MetricUnit.Count, 1);

      await auditIdentityRecordInvalidated(userId, interventionCode);
    } else {
      const responseBody = await response.json();
      if (isEVCSErrorResponse(responseBody) && response.status === 404) {
        metrics.addMetric(MetricName.IdentityDoesNotExist, MetricUnit.Count, 1);
      } else {
        logger.error("Error calling service to invalid user", {
          cause: response.statusText,
          status: response.status,
          body: responseBody,
        });
        throw new Error("Call to invalidation endpoint failed");
      }
    }
  } catch (error) {
    if (error instanceof TypeError) {
      logger.error("Error calling service to invalidate user", { cause: error.cause, message: error.message });
    }
    throw error;
  }
};

const parseSQSRecords = (records: SQSRecord[]): AisMessage[] =>
  records.map((record, index) => {
    if (!record?.body) {
      throw new Error(`SQS record ${index} does not have a body`);
    }

    const recordObject = JSON.parse(record.body);
    if (isAisMessage(recordObject)) {
      return recordObject;
    }

    throw new Error(`SQS record ${index} does not have required fields`);
  });

const isInterventionRecord = (message: AisMessage, configuration: Configuration) =>
  isStringWithLength(message.intervention_code) &&
  configuration.interventionCodesToInvalidate.includes(message.intervention_code);
