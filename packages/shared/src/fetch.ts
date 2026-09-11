export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** グローバル fetch を依存として渡すための薄い包み。テストではディスパッチ関数に差し替える */
export const nodeFetch: FetchLike = (input, init) => fetch(input, init);
