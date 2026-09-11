import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import type { Logger } from "@sandbox/shared";
import type { SeedUser } from "./seed-data.ts";

export interface CognitoSeedOptions {
  readonly region: string;
  readonly userPoolId: string;
  readonly password: string;
}

/**
 * テストユーザーを Cognito に作り、sub を返す。冪等。
 * AdminSetUserPassword を permanent で行い、NEW_PASSWORD_REQUIRED チャレンジを避ける。
 */
export async function ensureCognitoUsers(
  users: ReadonlyArray<SeedUser>,
  options: CognitoSeedOptions,
  logger: Logger,
): Promise<Map<string, string>> {
  const client = new CognitoIdentityProviderClient({ region: options.region });
  const subs = new Map<string, string>();

  for (const user of users) {
    await createIfMissing(client, options.userPoolId, user, logger);
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: options.userPoolId,
        Username: user.username,
        Password: options.password,
        Permanent: true,
      }),
    );
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: options.userPoolId,
        Username: user.username,
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: user.name },
        ],
      }),
    );
    const fetched = await client.send(
      new AdminGetUserCommand({ UserPoolId: options.userPoolId, Username: user.username }),
    );
    const sub = fetched.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value;
    if (sub === undefined) throw new Error(`sub not found for cognito user ${user.username}`);
    subs.set(user.username, sub);
    logger.info("cognito user ready", { username: user.username });
  }
  return subs;
}

async function createIfMissing(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  user: SeedUser,
  logger: Logger,
): Promise<void> {
  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.username,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: user.name },
        ],
      }),
    );
    logger.info("cognito user created", { username: user.username });
  } catch (error: unknown) {
    if (error instanceof UsernameExistsException) return;
    throw error;
  }
}
