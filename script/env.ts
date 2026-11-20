// Signs in to the instance named by PAPERCLIP_URL, PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD. The cookie stays in memory.
import { signIn } from "../src/api/auth.ts"
import { Client } from "../src/api/client.ts"

export async function signedInClient(): Promise<Client> {
  const { PAPERCLIP_URL: url, PAPERCLIP_EMAIL: email, PAPERCLIP_PASSWORD: password } = process.env
  if (!url || !email || !password) {
    console.error("Set PAPERCLIP_URL, PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD first.")
    process.exit(2)
  }
  const client = new Client(url)
  await signIn(client, email, password)
  return client
}
