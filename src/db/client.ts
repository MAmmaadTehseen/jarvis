import { CreateTableCommand, DescribeTableCommand, DynamoDBClient, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "../config.js";
import { log } from "../logger.js";

export const ddb = new DynamoDBClient({
  region: config.AWS_REGION,
  ...(config.DYNAMODB_ENDPOINT
    ? { endpoint: config.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
});

export const doc = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Local dev only: create the single table if DynamoDB Local doesn't have it.
 * On AWS the table is owned by Terraform, so this is a no-op there.
 */
export async function ensureTable(): Promise<void> {
  if (!config.DYNAMODB_ENDPOINT) return;
  const TableName = config.TABLE_NAME;
  try {
    await ddb.send(new DescribeTableCommand({ TableName }));
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
  log.info({ TableName }, "creating local table");
  await ddb.send(
    new CreateTableCommand({
      TableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );
}
