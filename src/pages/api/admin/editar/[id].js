export async function POST({ request, params, redirect }) {
  const form = await request.formData();
  const data = Object.fromEntries(form.entries());

  const id = params.id;
  console.log(`Actualizar serie ${id}`, data);

  // Aquí conecta con tu DB para hacer UPDATE

  return redirect('/admin');
}
