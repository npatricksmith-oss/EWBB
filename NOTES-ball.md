# Team Ball Notes

- Added `src/ui/baseballSprite.js` exporting `drawPixelBaseball(ctx, x, y, radiusPx, spin, opts)`. It caches tiny quantized spin sprites and draws them with smoothing disabled.
- Updated the scoped ball drawing in `fieldRenderer1987.js` to use the sprite for the full-field ball while preserving the ground shadow. Duel pitch flight now uses the same sprite with pitch-type spin rates, renders red strike/green ball call markers based on `pitchStep.outcome`, and briefly sends contacted balls along `launchVector.sprayAngleDeg` and `launchAngleDeg` before the renderer transitions to full field.
- Wiring: no additional coordinator wiring is needed; `fieldRenderer1987.js` imports the helper directly. Pitch types currently map to visual spin rates in the renderer because the pitch step does not expose spin telemetry.
