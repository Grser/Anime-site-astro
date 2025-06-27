import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete("session", { path: "/" });

  return new Response(JSON.stringify({ message: "Sesión cerrada" }), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
};
