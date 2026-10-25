import { defineMiddleware } from 'astro:middleware';
import { clearLegacyCookies, getSessionUser, hasProfilePickedFlag } from './lib/session';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const isAdminPage = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

// Rutas que no deben disparar la redirección al picker de perfiles aunque el usuario
// tenga varios perfiles y no haya elegido ninguno todavía. El propio picker, su API,
// el logout y los assets estáticos quedan fuera. El admin también sigue funcionando
// para no cerrar la puerta en caso de que el administrador necesite entrar a arreglar
// algo sin tener que elegir perfil primero.
const skipProfilePicker = (pathname: string) =>
  pathname === '/perfiles' ||
  pathname.startsWith('/api/perfiles') ||
  pathname.startsWith('/api/logout') ||
  pathname.startsWith('/api/login') ||
  pathname.startsWith('/api/auth/') ||
  pathname.startsWith('/api/media/') ||
  pathname.startsWith('/api/proxy/') ||
  pathname.startsWith('/_astro/') ||
  pathname.startsWith('/_image') ||
  pathname === '/favico.ico' ||
  pathname === '/avatar.jpeg' ||
  pathname.startsWith('/clawnvid-') ||
  pathname.startsWith('/kitsuImages/') ||
  isAdminPage(pathname);

export const onRequest = defineMiddleware(async (context, next) => {
  // Las páginas prerenderizadas (p. ej. 404) no tienen cookies ni sesión.
  if (context.isPrerendered) return next();

  // Las cookies antiguas sin firma ya no se aceptan; se eliminan para que no confundan.
  clearLegacyCookies(context.cookies);

  const user = await getSessionUser(context.cookies);
  context.locals.user = user;

  if (isAdminPage(context.url.pathname)) {
    if (!user) {
      return context.redirect(`/login?next=${encodeURIComponent(context.url.pathname + context.url.search)}`);
    }
    if (!user.esAdmin) return context.redirect('/');
  }

  // Redirección al picker de perfiles cada sesión del navegador (patrón Crunchyroll):
  // si la cuenta tiene MÁS DE UN perfil y no hay cookie cv_profile_picked (sesión
  // del navegador), redirige al picker. Al elegir perfil se setea la cookie, que
  // muere al cerrar el navegador — próxima apertura vuelve a mostrar el picker.
  // Un usuario con un solo perfil nunca pasa por el picker.
  if (
    user &&
    user.perfilesCount > 1 &&
    !hasProfilePickedFlag(context.cookies) &&
    !skipProfilePicker(context.url.pathname)
  ) {
    const next = encodeURIComponent(context.url.pathname + context.url.search);
    return context.redirect(`/perfiles?next=${next}`);
  }

  const response = await next();

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) {
      try {
        response.headers.set(name, value);
      } catch {
        // Algunas respuestas (p. ej. redirecciones) tienen cabeceras inmutables.
      }
    }
  }

  // Las páginas personalizadas o de administración no deben quedar en cachés compartidas.
  if ((user || isAdminPage(context.url.pathname)) && !response.headers.has('Cache-Control')) {
    try {
      response.headers.set('Cache-Control', 'private, no-store');
    } catch {
      // ignorar
    }
  }

  return response;
});
