// src/pages/api/episodios/[temporadaId].ts
import db from '../../../lib/db';
import type { APIRoute } from 'astro';
import type { RowDataPacket } from 'mysql2';

interface Episodio extends RowDataPacket {
  id: number;
  titulo: string;
  numero_episodio: number;
  duracion: number;
  idioma: string;
  imagen_preview: string;
  temporada_id: number;
}

interface Temporada extends RowDataPacket {
  id: number;
}

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const temporadaId = params.temporadaId;

    // Validar que temporadaId sea un número válido
    if (!temporadaId || isNaN(Number(temporadaId))) {
      return new Response(
        JSON.stringify({ 
          error: 'ID de temporada inválido' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Verificar que la temporada existe
    const [[temporada]] = await db.query<Temporada[]>(
      'SELECT id FROM temporadas WHERE id = ?',
      [temporadaId]
    );

    if (!temporada) {
      return new Response(
        JSON.stringify({ 
          error: 'Temporada no encontrada' 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Obtener episodios
    const [episodios] = await db.query<Episodio[]>(
      `SELECT 
        id,
        titulo,
        numero_episodio,
        duracion,
        idioma,
        imagen_preview,
        temporada_id
      FROM episodios 
      WHERE temporada_id = ? 
      ORDER BY numero_episodio`,
      [temporadaId]
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: Array.isArray(episodios) ? episodios : []
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );

  } catch (error) {
    console.error('Error al obtener episodios:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
