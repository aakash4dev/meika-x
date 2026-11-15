// Demo login: one shared, pre-confirmed account so visitors (and judges) can use everything without signing up.
// On by default for this hackathon build; set DEMO_LOGIN=off to remove the button and block it.
import "server-only";
import crypto from "crypto";
import { db } from "./supabase/admin";

export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@meika-x.example";

export const demoLoginEnabled = () => process.env.DEMO_LOGIN !== "off";

export const isDemoUser = (email: string | null | undefined) => Boolean(email) && email!.toLowerCase() === DEMO_EMAIL.toLowerCase();

/** The demo password never leaves the server: set DEMO_PASSWORD, or it is derived from the Supabase secret key. */
export function demoPassword(): string {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHmac("sha256", secret).update("meika-x demo account").digest("base64url");
}

/** Make sure the demo account exists, is confirmed and has the current demo password. */
export async function ensureDemoUser(): Promise<void> {
  const admin = db().auth.admin;
  const password = demoPassword();
  const created = await admin.createUser({ email: DEMO_EMAIL, password, email_confirm: true, user_metadata: { demo: true } });
  if (!created.error) return;
  if (created.error.code !== "email_exists") throw new Error(`Could not create the demo account: ${created.error.message}`);
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not find the demo account: ${error.message}`);
    const user = data.users.find((u) => isDemoUser(u.email));
    if (user) {
      const upd = await admin.updateUserById(user.id, { password, email_confirm: true });
      if (upd.error) throw new Error(`Could not reset the demo account: ${upd.error.message}`);
      return;
    }
    if (data.users.length < 200) break;
  }
  throw new Error("The demo account exists but could not be found.");
}
