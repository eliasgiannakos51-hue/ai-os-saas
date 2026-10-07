/**
 * The id a link asks a tool to open (`?project=`, `?record=`), or null.
 *
 * Only a UUID: every table the Library reads keys its rows by one, and a
 * value that is not one would reach the database only to fail there.
 * Who may open it is the query's business — each page reads the row with
 * `.eq("user_id", user.id)`, so an id that belongs to somebody else opens
 * nothing.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRequestedId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
