# Games menu concepts

Open `/scripts/fixtures/games-concepts/` on the existing review server at port 5195. Three review-only skins of the real LabsMenu: Glass Arcade, Pocket Arcade, and Night Arcade. Each embeds the same game menu, artwork, characters, and original back button without recording navigation. Full-size links support closer inspection.

`concepts.css` is gated by `data-game-concept`; the app-design fixture only sets this for an explicit valid `gameConcept` parameter on Games. Pocket Arcade was selected by the user. The new side of the main comparison uses Pocket Arcade; its original side and the live app retain their existing appearance. No gameplay engine changes. Game launches remain preview notices; instrument and character selection use the existing controls on the isolated review origin.
