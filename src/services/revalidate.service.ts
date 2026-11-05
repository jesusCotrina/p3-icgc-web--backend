import { env } from '../config/env';

/**
 * Avisa a la web pública (Next.js) que vuelva a generar las páginas afectadas.
 *
 * SEO: sin esto, un post o curso nuevo tarda hasta 5 minutos en aparecer
 * (el ISR de Next). Con esto, Google y los visitantes ven el cambio al
 * instante. Es "dispara y olvida": si la web está caída, el gestor no falla;
 * el ISR igual la pondrá al día en unos minutos.
 */
export function revalidateWeb(tags: string[]): void {
  if (!env.WEB_REVALIDATE_URL || !env.REVALIDATE_SECRET) return;

  fetch(env.WEB_REVALIDATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-revalidate-secret': env.REVALIDATE_SECRET,
    },
    body: JSON.stringify({ tags }),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      // Un 401 es REVALIDATE_SECRET distinto en el servidor y en Vercel; un 404,
      // WEB_REVALIDATE_URL apuntando a otro dominio. Sin este aviso el fallo
      // es silencioso y la web tarda hasta 24 h en mostrar el cambio.
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[revalidate] La web rechazó la petición (${tags.join(', ')}): HTTP ${res.status} en ${env.WEB_REVALIDATE_URL}`);
      }
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(`[revalidate] La web no respondió (${tags.join(', ')}):`, (err as Error).message);
    });
}
