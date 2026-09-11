import { startApiCore } from "@sandbox/api-core";
import { CMS, CMS_SCHEMA } from "./definition.ts";
import { PgPostRepository } from "./posts/repository.ts";
import { postRoutes } from "./posts/routes.ts";

startApiCore("cms-api", {
  definition: CMS,
  schema: CMS_SCHEMA,
  routes: (pool) => [postRoutes(new PgPostRepository(pool))],
});
