import {
  endUserResponseSchema,
  endUsersResponseSchema,
  type EndUserInput,
  type EndUserPatch,
  type EndUsersResponse,
} from "@sandbox/api-contract";
import { api, apiVoid } from "@sandbox/web-ui";

export function loadEndUsers(): Promise<EndUsersResponse> {
  return api(endUsersResponseSchema, "/v1/end-users");
}

export function createEndUser(input: EndUserInput) {
  return api(endUserResponseSchema, "/v1/end-users", { method: "POST", json: input });
}

export function updateEndUser(id: string, input: EndUserPatch) {
  return api(endUserResponseSchema, `/v1/end-users/${id}`, { method: "PATCH", json: input });
}

export function deleteEndUser(id: string): Promise<void> {
  return apiVoid(`/v1/end-users/${id}`, { method: "DELETE" });
}
