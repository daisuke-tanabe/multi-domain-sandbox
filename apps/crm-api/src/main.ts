import { startApiCore } from "@sandbox/api-core";
import { CRM, CRM_SCHEMA } from "./definition.ts";
import { PgEndUserRepository } from "./end-users/infrastructure/pg-end-user-repository.ts";
import { endUserRoutes } from "./end-users/interface/routes.ts";

startApiCore("crm-api", {
  definition: CRM,
  schema: CRM_SCHEMA,
  routes: (pool) => [endUserRoutes(new PgEndUserRepository(pool))],
});
