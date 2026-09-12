import {
  inviteMemberResponseSchema,
  memberDetailResponseSchema,
  memberResponseSchema,
  membersResponseSchema,
  permissionOverridesResponseSchema,
  type InviteMemberInput,
  type MembersResponse,
  type PermissionOverride,
} from "@sandbox/api-contract";
import { api, apiVoid } from "../../lib/api.ts";

export function loadMembers(): Promise<MembersResponse> {
  return api(membersResponseSchema, "/v1/members");
}

export function loadMemberDetail(userId: string) {
  return api(memberDetailResponseSchema, `/v1/members/${userId}`);
}

export function inviteMember(input: InviteMemberInput) {
  return api(inviteMemberResponseSchema, "/v1/members", { method: "POST", json: input });
}

export function changeMemberRole(userId: string, role: string) {
  return api(memberResponseSchema, `/v1/members/${userId}`, { method: "PATCH", json: { role } });
}

export function replaceMemberOverrides(
  userId: string,
  overrides: ReadonlyArray<PermissionOverride>,
) {
  return api(permissionOverridesResponseSchema, `/v1/members/${userId}/permissions`, {
    method: "PUT",
    json: { overrides },
  });
}

export function removeMember(userId: string): Promise<void> {
  return apiVoid(`/v1/members/${userId}`, { method: "DELETE" });
}
