import { getPublicTournament } from "@/lib/queries";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const data = slug.length <= 200 ? await getPublicTournament(slug) : null;
    if (!data)
      return Response.json({ error: "This tournament isn’t available." }, { status: 404, headers });
    return Response.json(data, { headers });
  } catch (error) {
    console.error(
      "Public tournament update failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: "Unable to update tournament progress." },
      { status: 500, headers },
    );
  }
}
