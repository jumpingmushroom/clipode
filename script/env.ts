// Signs in to the instance named by PAPERCLIP_URL, PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD.
// Helper scripts share one session cookie, cached with mode 0600 in the clipode state directory, so repeated runs
// do not trip the server's sign-in rate limit. The smoke script asks for a fresh session to exercise sign-in.
import { dirname, join } from "node:path"
import { authFilePath, getSession, loadCookie, saveCookie, signIn } from "../src/api/auth.ts"
import { Client } from "../src/api/client.ts"

const cachePath = join(dirname(authFilePath()), "scripts-auth.json")

export async function signedInClient(opts: { fresh?: boolean } = {}): Promise<Client> {
  const { PAPERCLIP_URL: url, PAPERCLIP_EMAIL: email, PAPERCLIP_PASSWORD: password } = process.env
  if (!url || !email || !password) {
    console.error("Set PAPERCLIP_URL, PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD first.")
    process.exit(2)
  }
  const client = new Client(url)
  if (!opts.fresh) {
    client.setCookieHeader((await loadCookie(client.baseUrl, cachePath)) ?? "")
    if (client.cookieHeader() && (await getSession(client))) return client
  }
  await signIn(client, email, password)
  if (!opts.fresh) await saveCookie(client.baseUrl, client.cookieHeader(), cachePath)
  return client
}
