import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <AuthForm mode="register" />
    </main>
  );
}