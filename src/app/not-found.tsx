import Link from "next/link";

import { Brand } from "@/app/_components/brand";

export default function NotFound() {
  return (
    <main className="not-found shell">
      <Brand />
      <span>404</span>
      <h1>Nothing is being watched here.</h1>
      <p>The subscription may have moved or been removed.</p>
      <Link className="button button-primary" href="/">
        Back to subscriptions
      </Link>
    </main>
  );
}
