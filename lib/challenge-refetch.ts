/**
 * Who may re-issue a challenge they have already sat.
 *
 * "Restart challenge" throws away a graded attempt and asks the provider for a
 * fresh lesson and a fresh paper on the same subtopic. That is a model call per
 * press and a second bite at a topic whose score is already recorded, so it is
 * not something every student gets: it exists for checking what a rebuilt
 * challenge looks like, and it stays with the accounts doing that checking.
 *
 * SERVER-ONLY, AND READ TWICE
 * ---------------------------
 * The route handler reads it to decide whether to honour the POST. The
 * challenges PAGE reads it too — it is a server component, so it resolves the
 * answer to a boolean and passes that down, and the client is told only whether
 * to draw the button, never whose address is on the list. That keeps this out of
 * the browser bundle entirely; a `NEXT_PUBLIC_` twin would have inlined the
 * address into JavaScript every visitor downloads for no benefit.
 *
 * Both reads are needed and they are not interchangeable. A hidden button is
 * presentation, not authorisation — the endpoint is one `fetch` away for anyone
 * who opens the console — and a server that refused without the client knowing
 * would show every other student a button that always errors.
 *
 * Empty list means nobody, deliberately. A misconfigured deployment that gave
 * the feature to everyone would be the expensive failure, not the visible one.
 */
function parse(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function mayRestartChallenges(email: string | null | undefined) {
  return parse(process.env.CHALLENGE_REFETCH_EMAILS).has((email ?? "").trim().toLowerCase());
}
