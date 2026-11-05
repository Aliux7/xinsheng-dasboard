"use client"

import { useSyncExternalStore } from "react"
import { CircleHelpIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PAGE_GUIDES } from "@/lib/page-guides"

/** Hidden guides are remembered per page in this browser only (a convenience, not data). */
const KEY = "xs-guide-hidden"
const EVENT = "xs-guide"

function hiddenPages(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

function setHidden(path: string, hidden: boolean) {
  try {
    const list = new Set<string>(JSON.parse(hiddenPages()))
    if (hidden) list.add(path)
    else list.delete(path)
    localStorage.setItem(KEY, JSON.stringify([...list]))
  } catch {
    // Storage blocked: the guide just shows again next time.
  }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

function useHidden(path: string) {
  const raw = useSyncExternalStore(subscribe, hiddenPages, () => "[]")
  return (JSON.parse(raw) as string[]).includes(path)
}

/** "Panduan" button for the header: shows the page's guide again after it was hidden. */
export function GuideToggle({ path }: { path: string }) {
  const hidden = useHidden(path)
  if (!PAGE_GUIDES[path] || !hidden) return null
  return (
    <Button variant="outline" size="sm" className="ml-auto" onClick={() => setHidden(path, false)}>
      <CircleHelpIcon />
      Panduan
    </Button>
  )
}

/** The page's purpose and steps in plain words (lib/page-guides.ts), with a button to hide it. */
export function PageGuide({ path }: { path: string }) {
  const guide = PAGE_GUIDES[path]
  const hidden = useHidden(path)
  if (!guide || hidden) return null
  return (
    <section className="relative flex flex-col gap-2 rounded-xl border border-brand/20 bg-brand-soft/50 p-4 pr-12 text-sm">
      <div className="flex items-start gap-2 font-medium text-brand">
        <CircleHelpIcon className="mt-0.5 size-4 shrink-0" />
        <p>{guide.purpose}</p>
      </div>
      <ol className="ml-6 list-decimal space-y-1 text-foreground/80 marker:text-brand">
        {guide.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" onClick={() => setHidden(path, true)} aria-label="Sembunyikan panduan" title="Sembunyikan panduan">
        <XIcon />
      </Button>
    </section>
  )
}
