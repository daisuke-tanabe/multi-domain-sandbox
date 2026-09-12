import { loadMembers, MembersPage } from "@sandbox/web-ui";
import type { Route } from "./+types/members.route";

export const clientLoader = loadMembers;

export default function Members({ loaderData }: Route.ComponentProps) {
  return <MembersPage members={loaderData.members} />;
}
