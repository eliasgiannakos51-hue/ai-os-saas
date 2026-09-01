import { redirect } from "next/navigation";

// MERGED INTO "Mine" — V4.6 #3.
//
// Favorites, History and "search my records" were three sidebar rows
// answering one question. The starred list now lives as a tab on
// /dashboard/timeline, rendered by the SAME FavoritesList component off
// the SAME loadAllFavorites query, so nothing about the list changed —
// only where you reach it.
//
// This route stays, as a redirect rather than a 404, because it is in
// people's bookmarks and in the command palette's history. It is also
// still an entry in lib/sidebar-nav.ts (hidden from the sidebar, present
// in the palette and on /dashboard/records), so searching "favorites"
// still finds it and still lands on the list.
export default function FavoritesPage() {
  redirect("/dashboard/timeline?view=fav");
}
