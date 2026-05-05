import Link from "next/link";
import { buttonClassNames, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ROUTES } from "@/lib/constants";
import { registerAction } from "./actions";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const message = typeof params.message === "string" ? params.message : undefined;

  return (
    <Card
      title="Create account"
      description="Start your Smart-Reader workspace. Registration logic will be connected in a later step."
    >
      <form action={registerAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            required
            minLength={6}
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        )}
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={ROUTES.login} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
          Already have an account
        </Link>
        <Link href={ROUTES.home} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
          Back to home
        </Link>
      </div>
    </Card>
  );
}
