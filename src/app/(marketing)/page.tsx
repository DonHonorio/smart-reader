import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassNames } from "@/components/ui/Button";
import { CREDIT_PACKS } from "@/lib/billing";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

const BENEFITS = [
  {
    title: "Traducción contextual",
    description: "Entiende una palabra dentro de su frase real, con menos ruido.",
  },
  {
    title: "Guarda vocabulario en un clic",
    description: "Selecciona, guarda y sigue leyendo sin romper tu ritmo.",
  },
  {
    title: "Exporta a Anki",
    description: "Genera CSV listo para importar y repasar al instante.",
  },
  {
    title: "Sigue leyendo en cualquier dispositivo",
    description: "Continúa donde te quedaste en desktop o móvil.",
  },
] as const;

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    title: "Sube tu EPUB",
    description: "Carga tu libro y déjalo listo en tu biblioteca personal.",
  },
  {
    step: "02",
    title: "Lee sin distracciones",
    description: "Abre el lector y concéntrate en el contenido.",
  },
  {
    step: "03",
    title: "Haz clic para traducir",
    description: "Selecciona una frase y obtén traducción en contexto.",
  },
  {
    step: "04",
    title: "Guarda vocabulario",
    description: "Guarda términos útiles con su contexto en un segundo.",
  },
  {
    step: "05",
    title: "Exporta a Anki",
    description: "Descarga tu CSV y pásalo a tus decks cuando quieras.",
  },
] as const;

const COMPARISON_ITEMS = [
  {
    label: "Sin suscripción obligatoria",
    smartReader: "Pagas por libro desde $3",
    traditionalApps: "Pagos mensuales fijos",
  },
  {
    label: "Tus propios libros",
    smartReader: "Subes tus EPUB",
    traditionalApps: "Catálogo cerrado",
  },
  {
    label: "Traducción contextual",
    smartReader: "Incluida durante la lectura",
    traditionalApps: "Funciones genéricas fuera de contexto",
  },
  {
    label: "Exportación a Anki",
    smartReader: "CSV listo para importar",
    traditionalApps: "Exportación limitada o inexistente",
  },
] as const;

const PRICING_TEXT: Record<string, string> = {
  single_credit: "Ideal si quieres empezar con un solo libro.",
  basic_pack: "Perfecto para arrancar con margen y mejor precio por libro.",
  avid_reader_pack: "Pensado para lectores frecuentes con mayor ahorro.",
};

function BenefitIcon({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5V6.5Z" />
        <path d="M8 8h8M8 12h6" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 4v16M4 12h16" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export default async function MarketingHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(ROUTES.dashboard);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 pb-4 sm:space-y-20 sm:pb-8">
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_0.95fr] lg:gap-10">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Aprende leyendo tus libros
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Deja de pagar $12 al mes.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Lee tus libros, haz clic, traduce en contexto y exporta a Anki. Sin suscripciones
              obligatorias. Desde $3 por libro.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.register} className={buttonClassNames()}>
              Empieza gratis
            </Link>
            <Link href="#como-funciona" className={buttonClassNames({ variant: "secondary" })}>
              Ver cómo funciona
            </Link>
          </div>

          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">Sin cuota mensual</p>
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">Tus EPUB, tu flujo</p>
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              Traducción contextual
            </p>
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2">Exportación a Anki</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-4xl bg-linear-to-b from-slate-200 to-slate-100 blur-2xl" />
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100 sm:p-5">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-300">
                <span>Reader View</span>
                <span>Chapter 04</span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-slate-700" />
                <div className="h-2 w-[92%] rounded-full bg-slate-700" />
                <div className="h-2 w-[88%] rounded-full bg-slate-700" />
                <div className="h-2 w-[95%] rounded-full bg-slate-700" />
                <div className="h-2 w-[74%] rounded-full bg-slate-700" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Traducción
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">in context</p>
                <p className="mt-1 text-xs text-slate-600">Meaning adapted to the sentence.</p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anki CSV</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">vocabulary_export.csv</p>
                <p className="mt-1 text-xs text-slate-600">Ready to import in one click.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Todo lo esencial para aprender leyendo
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Un flujo simple para pasar de lectura real a repaso efectivo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit, index) => (
            <article
              key={benefit.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-700">
                <BenefitIcon index={index} />
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="space-y-6 scroll-mt-24">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Cómo funciona
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Del EPUB a Anki en cinco pasos directos.
          </p>
        </div>

        <ol className="grid gap-3 md:grid-cols-5">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold tracking-wide text-slate-500">{step.step}</p>
              <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Menos ruido. Más lectura real.
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Smart-Reader se enfoca en leer, entender y repasar, sin extras innecesarios.
          </p>
        </div>

        <div className="space-y-3">
          {COMPARISON_ITEMS.map((item) => (
            <article
              key={item.label}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1.25fr_1fr_1fr] sm:items-center"
            >
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Smart-Reader: {item.smartReader}
              </p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Tradicional: {item.traditionalApps}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Pricing claro desde el primer libro
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Sin cuotas mensuales. Tú decides cuándo subir un libro.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <article
              key={pack.id}
              className={`rounded-2xl border bg-white p-6 shadow-sm ${
                pack.highlighted ? "border-slate-900 ring-1 ring-slate-900/10" : "border-slate-200"
              }`}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{pack.name}</p>
              <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">{pack.displayPrice}</p>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {pack.credits} {pack.credits === 1 ? "credit" : "credits"}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {PRICING_TEXT[pack.id] ?? "Paga solo por los libros que quieras leer."}
              </p>

              <Link
                href={ROUTES.register}
                className={buttonClassNames({
                  variant: pack.highlighted ? "primary" : "secondary",
                  className: "mt-6 w-full",
                })}
              >
                Elegir plan
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Convierte tu lectura en aprendizaje real
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Empieza hoy con tus propios libros y crea vocabulario útil para Anki.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={ROUTES.register} className={buttonClassNames()}>
            Crear cuenta
          </Link>
          <Link href={ROUTES.login} className={buttonClassNames({ variant: "secondary" })}>
            Iniciar sesión
          </Link>
        </div>
      </section>
    </div>
  );
}
