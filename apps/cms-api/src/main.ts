import { startApiCore } from "@sandbox/api-core";
import { CMS, CMS_SCHEMA } from "./definition.ts";
import { PgPostRepository } from "./posts/infrastructure/pg-post-repository.ts";
import { postRoutes } from "./posts/interface/routes.ts";

startApiCore("cms-api", {
  definition: CMS,
  schema: CMS_SCHEMA,
  routes: (pool) => [postRoutes(new PgPostRepository(pool))],
});
