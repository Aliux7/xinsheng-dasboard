"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  /** Shown while not null, e.g. "Batalkan DO-261102001?". */
  title: string | null
  description?: string
  confirmLabel: string
  /** Throws to show the error in the dialog; the dialog closes when it resolves. */
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}

/** Asks for a mandatory reason before a destructive action (cancel a document). */
export function ReasonDialog({ title, description, confirmLabel, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setReason("")
    setError(null)
    onClose()
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  return (
    <Dialog open={title !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <Field className="my-6">
            <FieldLabel htmlFor="reason">Alasan</FieldLabel>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Kembali</DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
