# Changelog

All notable changes to the card and the ESPHome package. Versions follow [semantic versioning](https://semver.org/): a major bump means something in your configuration must change, a minor bump adds features, a patch fixes bugs.

## [1.0.0] - 2026-11-21

First release.

- ESPHome package for ESP32 + CC1101: flue temperature, draught, pressure setpoint, fan power, fan speed and operating mode
- Start, stop and speed control, confirmed by the power unit and resent automatically when lost
- Stop is blocked while the flue is hot
- Lovelace card styled as a backlit LCD panel, installable through HACS
- The command status is shown above the display
