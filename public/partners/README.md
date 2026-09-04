# Partner logos

Logo files referenced by `data/partners.ts` as `/partners/<filename>`.

- **SVG preferred.** It stays sharp at any height and usually has a transparent background already.
- **PNG with a transparent background** otherwise. A white box behind a logo shows up badly on a dark section.
- The row caps logos at ~40px tall and lets width flow, so a wide wordmark and a square badge can sit next to each other. Export at 2x that height or more (80px+) so it stays crisp.
- **Keep the source file the organization sent**, whatever it is (AI, EPS, PDF, oversized PNG). Drop it in `_source/` next to the web copy. If they rebrand, or someone asks for a different format later, the original is the only thing that saves you re-asking.

Nothing here renders until the matching entry in `data/partners.ts` has `approved: true`.
