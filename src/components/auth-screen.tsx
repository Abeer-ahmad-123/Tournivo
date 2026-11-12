"use client";
import Link from "next/link";
import { useState } from "react";
import { Trophy, ArrowRight, Check, ShieldCheck, Swords, Globe2, Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button, Input, Field } from "./ui/primitives";
export function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget),
      email = String(data.get("email")).trim().toLowerCase(),
      password = String(data.get("password"));
    try {
      const result = signup
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")).trim() })
        : await authClient.signIn.email({ email, password });
      if (result.error) setError(result.error.message ?? "Unable to sign in. Check your details.");
      else onSuccess();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Trophy size={23} />
          </span>
          TOURNIVO<span className="brand-period">.</span>
        </Link>
        <div className="auth-story">
          <span className="eyebrow">
            <span className="live-dot" /> BUILT FOR THE COMPETITION
          </span>
          <h1>
            Big moments.
            <br />
            Seamlessly
            <br />
            <span>organized.</span>
          </h1>
          <p>
            From the first registration to the final whistle.
            <br />
            Your entire tournament, in one place.
          </p>
          <div className="auth-bracket" aria-label="Illustration of a tournament bracket">
            <div className="mini-round">
              <div>
                <span className="team-symbol blue">A</span> Your ambition <Check size={14} />
              </div>
              <div>
                <span className="team-symbol purple">B</span> Every possibility
              </div>
            </div>
            <div className="bracket-link" />
            <div className="mini-round final">
              <div>
                <Trophy size={18} /> A great competition
              </div>
              <span>EVERY COMPETITION. PERFECTLY ORGANIZED.</span>
            </div>
          </div>
          <div className="auth-features">
            <span>
              <Swords size={17} /> Sports & esports
            </span>
            <span>
              <Globe2 size={17} /> Any size. Any stage.
            </span>
          </div>
        </div>
        <div className="auth-brand-footer">
          YOUR COMPETITION. YOUR RULES.<span>EST. 2026</span>
        </div>
      </section>
      <section className="auth-form-section">
        <div className="auth-top">
          <ShieldCheck size={15} /> A secure home for your competitions
        </div>
        <div className="auth-form-wrap">
          <span className="section-kicker">LET’S GET YOU ORGANIZED</span>
          <h2>{signup ? "Start your next great competition." : "Welcome back."}</h2>
          <p>
            {signup
              ? "Create your account and make room for the big moments."
              : "Your tournaments are ready when you are."}
          </p>
          <form onSubmit={submit}>
            {signup && (
              <Field label="Your name">
                <Input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={160}
                  placeholder="Alex Morgan"
                />
              </Field>
            )}
            <Field label="Email address">
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@yourorganization.com"
              />
            </Field>
            <Field label="Password" hint={signup ? "Use at least 12 characters." : undefined}>
              <div className="password-input">
                <Input
                  id="password"
                  aria-label="Password"
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={signup ? 12 : 1}
                  maxLength={128}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? "Create a strong password" : "Enter your password"}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            {error && (
              <p role="alert" className="error-banner">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy} className="auth-submit">
              {signup ? "Create your account" : "Sign in to your workspace"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {signup ? "Already part of the competition?" : "New to Tournivo?"}{" "}
            <button
              onClick={() => {
                setSignup(!signup);
                setError("");
              }}
            >
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-note">
            <ShieldCheck size={19} />
            <span>
              Your workspace is private by default.
              <br />
              You decide when your tournament goes public.
            </span>
          </div>
        </div>
        <footer>
          Every Competition. Perfectly Organized.<span>© {new Date().getFullYear()} Tournivo</span>
        </footer>
      </section>
    </main>
  );
}
