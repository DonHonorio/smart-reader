import Link from "next/link";
import { buttonClassNames, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ROUTES } from "@/lib/constants";

export default function RegisterPage() {
  return (
    <Card
      title="Create account"
      description="Start your Smart-Reader workspace. Registration logic will be connected in a later step."
    >
      <form className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <Input id="fullName" type="text" autoComplete="name" placeholder="Jane Reader" />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
          />
        </div>
        <Button className="w-full">Create account</Button>
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
