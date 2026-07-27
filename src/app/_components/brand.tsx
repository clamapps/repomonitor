import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="RepoMonitor home">
      <span className="brand-mark" aria-hidden="true">
        R
      </span>
      <span>RepoMonitor</span>
    </Link>
  );
}
