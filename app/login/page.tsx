import AuthForm from "../auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error === "auth"
    ? "O link de autenticação é inválido ou expirou. Solicite um novo link."
    : "";
  return <AuthForm mode="login" initialError={initialError} />;
}
