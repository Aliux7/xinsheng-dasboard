"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // One-line pills with a gradient per type: no border, no close or action buttons.
      theme="light"
      position="top-right"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--width": "440px",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButton: false,
        classNames: {
          toast: "cn-toast border-0! py-3! shadow-lg text-white! bg-linear-to-r! from-neutral-900 to-neutral-700",
          title: "truncate whitespace-nowrap font-medium",
          description: "hidden!",
          actionButton: "hidden!",
          cancelButton: "hidden!",
          closeButton: "hidden!",
          success: "from-green-700! to-emerald-500!",
          error: "from-red-700! to-rose-500!",
          info: "from-[#2c3480]! to-indigo-500!",
          warning: "from-amber-600! to-yellow-500!",
          content: "min-w-0",
          icon: "text-white!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
