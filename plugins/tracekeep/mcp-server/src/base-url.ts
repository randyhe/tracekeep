const DEFAULT_BASE_URL = "http://127.0.0.1:4310";

export function resolveTracekeepBaseUrl(value = process.env.TRACEKEEP_BASE_URL ?? process.env.ATLAS_BASE_URL): string {
  const url = new URL(value ?? DEFAULT_BASE_URL);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new Error("TRACEKEEP_BASE_URL must use HTTP on localhost or 127.0.0.1");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("TRACEKEEP_BASE_URL must not contain credentials, a path, query parameters, or a fragment");
  }
  return url.origin;
}
