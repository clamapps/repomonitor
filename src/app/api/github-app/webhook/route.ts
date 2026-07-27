// The generated GitHub App has webhook delivery disabled. GitHub still requires
// a URL in the app manifest, so keep this inert endpoint available.
export async function POST() {
  return new Response(null, { status: 204 });
}
