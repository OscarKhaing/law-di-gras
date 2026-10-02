"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { CircleUserRoundIcon, LinkIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** A matter the header can name in the breadcrumb and jump to from search. */
export type HeaderMatter = { matterId: number; client: string; number: string };
/** Who connected Clio: the only user Case Desk knows of, since there is no sign-in. */
export type HeaderUser = { name: string; email: string; firm: string } | null;

/** The firm's header: where you are, a Cmd+K search to jump to a matter, and the user menu. */
export function SiteHeader({ matters, user }: { matters: HeaderMatter[]; user: HeaderUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const matterId = pathname.match(/^\/cases\/(\d+)/)?.[1];
  const here = matterId ? matters.find((matter) => String(matter.matterId) === matterId) : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            {matterId ? <BreadcrumbLink render={<Link href="/" />}>Matters</BreadcrumbLink> : <BreadcrumbPage>Matters</BreadcrumbPage>}
          </BreadcrumbItem>
          {matterId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{here?.client || `Matter ${matterId}`}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <Button variant="outline" size="sm" className="gap-2 bg-card text-muted-foreground" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="hidden sm:inline">Find a matter</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-xs sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Find a matter" description="Search by client or matter number">
        <Command>
          <CommandInput placeholder="Client or matter number" />
          <CommandList>
            <CommandEmpty>No matter has been read with that name or number.</CommandEmpty>
            <CommandGroup heading="Matters read into Case Desk">
              {matters.map((matter) => (
                <CommandItem
                  key={matter.matterId}
                  value={`${matter.client} ${matter.number}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/cases/${matter.matterId}`);
                  }}
                >
                  <span className="flex-1 truncate">{matter.client || "Client not named"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{matter.number}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <UserMenu user={user} />
    </header>
  );
}

function UserMenu({ user }: { user: HeaderUser }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Account and theme" />}>
        <CircleUserRoundIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            {user ? (
              <>
                <span className="font-medium text-foreground">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
                {user.firm && <span className="text-xs text-muted-foreground">{user.firm}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">No Clio account read yet</span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(value) => setTheme(String(value))}>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">Same as this computer</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* A plain navigation: the route sends the browser to Clio and back. */}
        <DropdownMenuItem render={<a href="/api/clio/connect" />}>
          <LinkIcon />
          Connect Clio again
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
