"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { cn, truncateWallet } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Matches" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const pathname = usePathname();
  const { publicKey } = useWallet();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            F
          </div>
          <span className="text-lg font-bold text-text-primary">Feto</span>
          <span className="hidden text-xs text-text-muted sm:inline">
            Live
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden items-center gap-1 sm:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-surface text-text-primary"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet + Mobile Menu */}
        <div className="flex items-center gap-3">
          {publicKey && (
            <span className="hidden text-xs text-text-muted sm:block">
              {truncateWallet(publicKey.toBase58())}
            </span>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
