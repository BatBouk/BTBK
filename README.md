# CleanFrame for TizenBrew

A quiet home screen (your apps, a photograph and the time) as a [TizenBrew](https://github.com/reisxd/TizenBrew) app module.
Adapted from [nthnclrk/CleanFrame](https://github.com/nthnclrk/CleanFrame) (MIT). Not affiliated with Samsung.

## How it differs from the original

- TizenBrew module pages have no Tizen APIs, so a small local service (`service/service.js`, listens on `127.0.0.1:18793` only)
  asks the TV's own local app API (`127.0.0.1:8001`) which apps are installed and launches them.
- Home apps by default: Netflix, YouTube, Prime Video, Disney+, Apple TV, Apple Music.
  "All apps" lists the known apps your TV has installed (Netflix, YouTube, Prime Video, Disney+, Apple TV, Apple Music, Spotify, Tubi).
- The Art Mode button is removed (it only exists on The Frame).

## Install (on the TV, in TizenBrew)

1. Open TizenBrew, then Module Manager, then Add GitHub Module.
2. Enter `<github-user>/<repository>@v0.1.0` (TizenBrew adds the `gh/` prefix itself).
3. Fully restart the TV, open TizenBrew, then open CleanFrame.

TizenBrew fetches modules through jsDelivr, so the repository must be public.

## Notes

- Untested on real hardware at the time of writing. If an app does not open, the error message names the IDs that were tried.
- Fonts, photographs and icons keep their own licences: see `THIRD_PARTY_NOTICES.md` and `app/assets`.
