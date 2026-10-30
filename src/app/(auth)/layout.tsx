export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">P</div>
          <h1 className="text-xl font-semibold">PostPilot</h1>
          <p className="text-sm text-zinc-500">Every social network, one dashboard</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
