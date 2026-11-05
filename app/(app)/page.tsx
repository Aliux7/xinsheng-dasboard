import { redirect } from "next/navigation"

/** No home page: "/" (where login lands) opens the first page of the menu. */
export default function Home() {
  redirect("/accounts")
}
