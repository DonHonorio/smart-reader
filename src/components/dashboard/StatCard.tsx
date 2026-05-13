import Link from "next/link";
import { buttonClassNames } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type StatCardProps = {
  title: string;
  value: number | string;
  description: string;
  href?: string;
};

export function StatCard({ title, value, description, href }: StatCardProps) {
  return (
    <Card
      className="h-full"
      footer={
        href ? (
          <Link href={href} className={buttonClassNames({ variant: "ghost", size: "sm" })}>
            View details
          </Link>
        ) : null
      }
    >
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </Card>
  );
}