# Design direction · 2026-10-22 · "the paper gets a studio's hands"

Reference Katie set: hello-world.studio/work. What makes it feel made, read from the page itself:
- The hero is a full-bleed moving picture of hands at work, with ONE floating card carrying the primary action and a single project. Nothing else competes.
- /work is a ruled catalogue: every cell has a logotype-style name top-left, a category top-right, the picture centred and large, service tags bottom-left, the year bottom-right. Dense, confident, the same geometry forty times.
- Personality lives in small repeated devices (the "STUDIO NEWS" marquee, the faces, the stars), never in the layout.
- A quiet "clients featured in" strip top-right rotates press logos.
- Motion is everywhere but polite: hover lifts, marquee, rotating strip, staggered loads.

What we take (craft), what we keep (identity), what we refuse (cloning):
- KEEP: the paper and ink palette, Libre Caslon Display + EB Garamond, the 1·5·10 dial (daylight to dusk), the engraved plates, the small-caps labels, the hairline engraving. These are the Appreciation Index; the inspector's eyebrow/hairline/numbering rules are consciously overruled for them (passed with --allow in the gate; said so in the report).
- TAKE 1 · The hero as an ephemera board. We store no photographs, so the "hands at work" picture becomes a drawn board of the bag world's printed things, made from live tracker rows: the plates of the bags moving most this week, a sold-listings receipt strip, a window price tag ("$7,967"), a runway ticket ("SS27 · look 62"), a Vogue Business tracker clipping. Layered, slightly rotated, in paper-2 tones. The ask box floats over it as the one card. The idea sentence: on this page, the receipts of the bag trade become the picture. The live thing: the board is built from today's numbers, so it is different each day.
- TAKE 2 · /browse becomes the catalogue. Ruled cells (our hairline), house name set in the display serif top-left, silhouette family top-right in small caps, the plate large and centred, "sold at 62%" and "$4,500 new" as outlined chips bottom-left, launch year bottom-right. Hover: the plate grows 3%, the cell steps to paper-2.
- TAKE 3 · A ticker under the masthead: "what moved today" from the tracker (sold listings seen, asks dropping, FWRD Renew count, the day's race leader). Pauses on hover, static under reduced motion. Our version of STUDIO NEWS.
- TAKE 4 · The motion layer: staggered entrances for the answer's sections (60–90 ms), hover lift on tiles, chips, shelf items and the plates, the dial's daylight-to-dusk as the signature move it already is.
- TAKE 5 · The frame: one pair of margins, paragraphs capped at 60ch, no text at the screen edge, every link styled.
- REFUSE: their gradients, 3D letters, blur, pills in colour, the mono nav, any photograph of a bag that is not ours.

Order of work (biggest effect, least risk): ticker + motion layer → /browse catalogue → hero ephemera board → gate + look rounds (inspect at 1440/768/390, critique, fix, three rounds max).
Gate allowances to declare: eyebrow (small-caps section labels are the house style), hairline (engraved rules), numbering (the receipts count 01·02·03 on purpose), mixed-font-headline (the italic clause is the house's voice).

## Katie's call, 2026-10-23
The hero board (plate, receipt, tag, ticket, clipping around the question) was removed at Katie's request: "get rid of these pop ups. I like the scroll up top though." The ticker stays. Do not reintroduce floating pieces around the hero; the first screen is the question alone.
