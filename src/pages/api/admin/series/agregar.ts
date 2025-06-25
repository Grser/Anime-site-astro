export async function POST({ request, redirect }) {
  const form = await request.formData();
  const data = Object.fromEntries(form.entries());

  // Aquí conecta con tu DB para hacer INSERT
  console.log('Insertar en la base de datos:', data);

  return redirect('/admin');
}
