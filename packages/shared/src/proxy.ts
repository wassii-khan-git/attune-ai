/**
 * Headers the web app adds when it forwards a browser's request to the API.
 *
 * The API sits behind the web app for browser traffic, so on its own it would
 * see every user as coming from the web app's address. The web app therefore
 * passes on the address it saw, together with a secret only the two share.
 * The API believes the address only when the secret matches.
 */
export const CLIENT_ADDRESS_HEADER = 'x-attune-client-ip';
export const PROXY_SECRET_HEADER = 'x-attune-proxy-secret';
