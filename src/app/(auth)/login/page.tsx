import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <AuthForm mode="login" next={next} />
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-4 rounded-lg bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          Demo data: run <code>npm run db:seed</code>, then log in as <b>owner@demo.test</b> or <b>viewer@demo.test</b> (password in README).
        </p>
      )}
    </>
  );
}
