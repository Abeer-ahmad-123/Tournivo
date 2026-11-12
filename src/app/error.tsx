"use client";
import { Button } from "@/components/ui/primitives";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-error">
      <h1>Something interrupted the competition.</h1>
      <p>Please try again. Your saved data is still in your workspace.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
