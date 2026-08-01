import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type RequestUser = {
  user: User | null;
  error: string | null;
};

/**
 * Usuario autenticado de la peticion en curso.
 *
 * `supabase.auth.getUser()` es un viaje de red a Supabase Auth, y al pintar una pagina
 * privada se repetia una vez por cada helper (layout, creditos, onboarding, libro,
 * progreso). `cache()` de React lo memoriza dentro de la misma peticion, asi que la
 * verificacion se hace una sola vez y el resto la reutiliza.
 *
 * La memorizacion no cruza peticiones: cada peticion tiene su propio ambito.
 */
export const getRequestUser = cache(async (): Promise<RequestUser> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    user: user ?? null,
    error: error ? error.message : null,
  };
});
