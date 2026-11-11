"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { validEmail } from "../lib/validation";

type Mode = "login" | "signup" | "forgot" | "reset";

export default function AuthForm({ mode, initialError = "" }: { mode: Mode; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const emailIsValid = validEmail(email);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const supabase = createClient();
    try {
      if (mode === "login") {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        router.push("/"); router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use pelo menos 8 caracteres na senha.");
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");
        const result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
        if (result.error) throw result.error;
        setMessage(result.data.session ? "Conta criada." : "Confira seu e-mail para confirmar a conta.");
        if (result.data.session) { router.push("/"); router.refresh(); }
      } else if (mode === "forgot") {
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
        if (result.error) throw result.error;
        setMessage("Se o e-mail estiver cadastrado, enviaremos um link de redefinição.");
      } else {
        if (password.length < 8) throw new Error("Use pelo menos 8 caracteres na senha.");
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        setMessage("Senha atualizada. Você já pode continuar.");
        setTimeout(() => { router.push("/"); router.refresh(); }, 700);
      }
    } catch (cause) {
      if (mode === "login") setError("E-mail ou senha inválidos.");
      else if (mode === "forgot") setError("Não foi possível enviar o e-mail agora. Tente novamente mais tarde.");
      else setError(cause instanceof Error ? cause.message : "Não foi possível concluir.");
    } finally { setBusy(false); }
  }

  async function magicLink() {
    if (!emailIsValid) {
      setError("Informe um e-mail válido para receber o link.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    const result = await createClient().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (result.error) setError("Não foi possível enviar o link agora. Tente novamente mais tarde.");
    else setMessage("Enviamos um link de acesso para o seu e-mail.");
    setBusy(false);
  }

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Recuperar senha" : "Definir nova senha";
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">minhas<span>finanças</span></div>
        <h1>{title}</h1>
        <p>Seus dados financeiros ficam separados por conta.</p>
        <form onSubmit={submit}>
          {mode !== "reset" && <label>E-mail<input type="email" autoComplete="email" placeholder="voce@exemplo.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          {(mode === "login" || mode === "signup" || mode === "reset") && <label>Senha<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Sua senha" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
          {(mode === "signup" || mode === "reset") && <label>Confirmar senha<input type="password" autoComplete="new-password" placeholder="Repita sua senha" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-message" role="status">{message}</div>}
          <button className="auth-primary" disabled={busy} aria-busy={busy}>{busy ? "Aguarde…" : title}</button>
        </form>
        {mode === "login" && <><button type="button" className="auth-secondary" disabled={busy || !emailIsValid} aria-busy={busy} onClick={() => void magicLink()}>Receber magic link</button><div className="auth-links"><a href="/forgot-password">Esqueci minha senha</a><a href="/signup">Criar conta</a></div></>}
        {mode === "signup" && <div className="auth-links"><a href="/login">Já tenho uma conta</a></div>}
        {(mode === "forgot" || mode === "reset") && <div className="auth-links"><a href="/login">Voltar ao login</a></div>}
      </section>
    </main>
  );
}
