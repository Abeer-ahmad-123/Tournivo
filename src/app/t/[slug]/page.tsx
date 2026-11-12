import { notFound } from "next/navigation";
import { getPublicTournament } from "@/lib/queries";
import { PublicTournament } from "@/components/public-tournament";
export const dynamic = "force-dynamic";
export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicTournament(slug);
  if (!data) notFound();
  return <PublicTournament key={data.tournament.id} data={JSON.parse(JSON.stringify(data))} />;
}
