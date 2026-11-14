import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Nihon Sar Loat home">
      <span className="brand-mark" lang="ja" aria-hidden="true">日</span>
      <span>Nihon Sar Loat<small>Japanese study</small></span>
    </Link>
  );
}
