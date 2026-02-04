import { requireAdmin } from '../../../../lib/admin';

export async function POST({ request, params, redirect, cookies }) {
  const adminCheck = await requireAdmin(cookies);
  if (adminCheck instanceof Response) return adminCheck;

  const form = await request.formData();
  const data = Object.fromEntries(form.entries());

  const id = params.id;
  console.log(`Actualizar serie ${id}`, data);

  // Aquí conecta con tu DB para hacer UPDATE

  return redirect('/admin');
}
