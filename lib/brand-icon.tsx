import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

/** Renders the logo ("X" in Aktura, white on near-black) as a square PNG of `size` px. */
export async function brandIcon(size: number) {
  // The .ttf is used as-is: the font licence doesn't allow modified files.
  const aktura = await readFile(join(process.cwd(), "assets/fonts/Aktura-Regular.ttf"))
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171717",
          color: "#ffffff",
          borderRadius: size * 0.22,
          fontFamily: "Aktura",
          fontSize: size * 0.68,
          lineHeight: 1,
        }}
      >
        X
      </div>
    ),
    { width: size, height: size, fonts: [{ name: "Aktura", data: aktura, style: "normal", weight: 400 }] }
  )
}
