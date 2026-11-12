import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page-error">
      <h1>This tournament isn’t available.</h1>
      <p>It may be private, unpublished, or the link may be incorrect.</p>
      <Link className="button button-primary" href="/">
        Go to Tournivo
      </Link>
    </main>
  );
}
