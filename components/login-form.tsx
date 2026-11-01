"use client"

import { useState } from "react"
import { cn } from "cn"
import { FirebaseError } from "firebase/app"
import { signInWithEmailAndPassword } from "firebase/auth"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { auth } from "@/lib/firebase"

function errorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Email atau kata sandi salah."
      case "auth/invalid-email":
        return "Masukkan alamat email yang valid."
      case "auth/user-disabled":
        return "Akun ini telah dinonaktifkan."
      case "auth/too-many-requests":
        return "Terlalu banyak percobaan. Silakan coba lagi nanti."
      case "auth/network-request-failed":
        return "Kesalahan jaringan. Periksa koneksi Anda lalu coba lagi."
    }
  }
  return "Terjadi kesalahan. Silakan coba lagi."
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // The login page redirects once the auth state changes.
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo className="size-16 rounded-xl text-4xl" />
            <h1 className="text-xl font-bold">Selamat datang di Xinsheng</h1>
            <FieldDescription>
              Masuk dengan email dan kata sandi Anda
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nama@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="password">Kata sandi</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sedang masuk…" : "Masuk"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
