import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const search = url.searchParams.get('search');

  if (!slug && !search) {
    return new Response(
      JSON.stringify({ error: 'Debes enviar "slug" o "search" como query param' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const kitsuUrl = slug
    ? `https://kitsu.io/api/edge/anime?filter[slug]=${encodeURIComponent(slug)}`
    : `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(search as string)}`;

  try {
    const response = await fetch(kitsuUrl);
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'No se pudo consultar Kitsu' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const anime = data?.data?.[0];

    if (!anime?.attributes) {
      return new Response(
        JSON.stringify({ error: 'No se encontraron resultados en Kitsu' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const attrs = anime.attributes;

    const result = {
      slug: attrs.slug,
      titulo: attrs.canonicalTitle ?? attrs.titles?.en ?? attrs.titles?.en_jp ?? '',
      descripcion: attrs.synopsis ?? '',
      banner:
        attrs.coverImage?.original ||
        attrs.coverImage?.large ||
        attrs.coverImage?.small ||
        null,
      icon:
        attrs.posterImage?.original ||
        attrs.posterImage?.large ||
        attrs.posterImage?.small ||
        null,
      fecha_estreno: attrs.startDate ?? null,
      genero: Array.isArray(attrs.abbreviatedTitles)
        ? attrs.abbreviatedTitles.join(', ')
        : attrs.subtype ?? null,
      popularidad: attrs.popularityRank ?? null,
      clasificacion_edad: attrs.ageRatingGuide ?? attrs.ageRating ?? null,
      estado: attrs.status ?? null,
      episodios: attrs.episodeCount ?? null,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error consultando Kitsu', error);
    return new Response(
      JSON.stringify({ error: 'Error interno al consultar Kitsu' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
