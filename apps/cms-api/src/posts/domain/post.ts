/**
 * CMS の投稿。タイトルと本文
 */
export interface Post {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PostInput {
  readonly title: string;
  readonly body: string;
}

/** 部分更新。省略した項目は変えない */
export interface PostInputPatch {
  readonly title?: string | undefined;
  readonly body?: string | undefined;
}
