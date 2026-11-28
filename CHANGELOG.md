# Changelog

All notable changes to the card and the ESPHome package. Versions follow [semantic versioning](https://semver.org/): a major bump means something in your configuration must change, a minor bump adds features, a patch fixes bugs.

## [1.1.0] - 2026-11-28

- ESPHome package: two more operating modes, 11 *Add wood* and 12 *After-run*, instead of *Unknown (11)* and *Unknown (12)*. Rebuild and install the device to get them.

## [1.0.1] - 2026-11-21

- Fixed: in a sections dashboard the card was given a fixed height of 4 rows, so on phones the next section was drawn on top of it. The height now follows the content.

## [1.0.0] - 2026-11-21

First release.

- ESPHome package for ESP32 + CC1101: flue temperature, draught, pressure setpoint, fan power, fan speed and operating mode
- Start, stop and speed control, confirmed by the power unit and resent automatically when lost
- Stop is blocked while the flue is hot
- Lovelace card styled as a backlit LCD panel, installable through HACS
- The command status is shown above the display
