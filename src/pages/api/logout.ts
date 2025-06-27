import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete("session", { path: "/" });

  return new Response(JSON.stringify({ message: "Sesión cerrada" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
