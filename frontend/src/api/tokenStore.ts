// The access token lives only in memory. It is gone when the tab closes or reloads,
// and a new one is fetched using the httpOnly refresh cookie.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
