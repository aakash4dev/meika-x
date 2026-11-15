import { redirect } from "next/navigation";
import PasswordForm from "@/components/auth/PasswordForm";
import { getUser } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · MEIKA-X" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account")}`);
  const reset = sp.reset === "1";
  const demo = isDemoUser(user.email);
  return (
    <main className="container auth-page">
      <div className="auth-stack">
        <section className="card">
          <div className="eyebrow">{demo ? "Demo account" : "Your account"}</div>
          <h1 className="auth-email">{demo ? "Demo user" : user.email}</h1>
          <p className="muted small">
            {demo
              ? "You are using the shared demo account, with full access: open cases, chat with Our AI and manage monitoring. Anything you create here is visible to everyone. Create your own account to keep your work under your name."
              : "Signed in. You can open cases, chat with Our AI and manage the monitoring watchlist."}
          </p>
          <form action={signOut}>
            <button className="btn">Sign out</button>
          </form>
        </section>
        {!demo && <PasswordForm highlight={reset} />}
      </div>
    </main>
  );
}
