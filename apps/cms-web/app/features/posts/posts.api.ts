import {
  postResponseSchema,
  postsResponseSchema,
  type PostInput,
  type PostPatch,
  type PostsResponse,
} from "@sandbox/api-contract";
import { api, apiVoid } from "@sandbox/web-ui";

export function loadPosts(): Promise<PostsResponse> {
  return api(postsResponseSchema, "/v1/posts");
}

export function createPost(input: PostInput) {
  return api(postResponseSchema, "/v1/posts", { method: "POST", json: input });
}

export function updatePost(id: string, input: PostPatch) {
  return api(postResponseSchema, `/v1/posts/${id}`, { method: "PATCH", json: input });
}

export function deletePost(id: string): Promise<void> {
  return apiVoid(`/v1/posts/${id}`, { method: "DELETE" });
}
