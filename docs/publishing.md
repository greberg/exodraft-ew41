# Publishing (maintainer notes)

## 1. Create the repository

1. Create a public GitHub repository named `exodraft-ew41`.
2. Replace `greberg` with your GitHub user name in:
   - `README.md`
   - `esphome/example-device.yaml`
   - `dist/exodraft-card.js` (header comment and `documentationURL`)
3. Push:

```
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin https://github.com/greberg/exodraft-ew41.git
git push -u origin main
```

4. In the repository settings, add a description (for example *Read and control an exodraft EW41 flue gas fan from Home Assistant with ESPHome and a CC1101*) and topics such as `home-assistant`, `hacs`, `lovelace`, `esphome`, `cc1101`, `z-wave`. Make sure *Issues* is enabled.

## 2. Make a release

HACS shows and installs GitHub releases. Without a release it falls back to the latest commit hash.

1. Bump `CARD_VERSION` in `dist/exodraft-card.js` (for example `1.1.0`).
2. Add a `## [1.1.0] - <date>` section at the top of `CHANGELOG.md`.
3. Commit, then tag and push:

```
git tag -a v1.1.0 -m "v1.1.0"
git push origin main v1.1.0
```

The workflow in `.github/workflows/release.yml` then creates the GitHub release, with the changelog section as release notes and `exodraft-card.js` attached. It fails if the tag does not match `CARD_VERSION` or the changelog has no section for the version.

## 3. Check the HACS validation

The workflow in `.github/workflows/validate.yml` runs the official HACS action on every push. It must be green before the default store will accept the repository.

## 4. Install as a custom repository

Anyone can install right away: HACS, *Custom repositories*, add the repository URL with type *Dashboard*.

## 5. Get into the default HACS store

1. Fork [hacs/default](https://github.com/hacs/default).
2. Add `greberg/exodraft-ew41` to the `plugin` file, keeping alphabetical order.
3. Open a pull request and fill in the template. The HACS bot checks the repository; reviewers may ask for changes.

After the pull request is merged, the card shows up in the HACS dashboard store for everyone.

## 6. Screenshot

`docs/images/card.png` was rendered outside Home Assistant with a fallback font. Replace it with a screenshot from your own dashboard, where the card uses its intended pixel font.

## ESPHome package updates

Devices that use `example-device.yaml` fetch `esphome/exodraft-ew41.yaml` from the `main` branch, refreshed once a day, on every build. Treat `main` as stable, or let users pin `ref:` to a release tag.
