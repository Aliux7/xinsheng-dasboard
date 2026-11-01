import { cn } from "@/lib/utils"

/** Company logo: an "X" in the Aktura font. The browser-tab icons (app/icon.tsx) match it. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Xinsheng"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary font-logo text-2xl leading-none text-primary-foreground",
        className
      )}
    >
      X
    </span>
  )
}
