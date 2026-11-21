# Discovery: Home ID, node IDs and frequency offset

Every EW41 set has its own Z-Wave network, so three values differ per installation. You find them once.

## 1. Home ID, from the panel

Open the panel's software information screen. It shows lines like:

```
DISPLAY VER. 88
VERSION: Z-WAVE 2.97
HOME ID: D4E36193
POWER UNIT A/D: 15
POWER UNIT VER: 44
```

Split the Home ID into four bytes for the substitutions:

```yaml
home_id_0: "0xD4"
home_id_1: "0xE3"
home_id_2: "0x61"
home_id_3: "0x93"
```

If the screen shows a Z-Wave version and a Home ID, your set uses the protocol this project implements.

## 2. Node IDs and frequency offset, with the discovery firmware

Flash [`esphome/exodraft-discovery.yaml`](../esphome/exodraft-discovery.yaml). It listens to all Z-Wave traffic and logs every frame with a valid checksum. Its receive filter is extra wide, so it works before you know your module's frequency offset.

Open the log and wake the panel by pressing a button, a few times with some seconds in between. You will see lines like:

```
FRAME home=D4E36193 src=1 dst=9 len=17 rssi=-54 foff=49194 D4.E3.61.93.01.41.01.11.09.91.00.04.01.01.02.0A.FE
FRAME home=D4E36193 src=1 dst=9 len=10 rssi=-53 foff=49194 D4.E3.61.93.01.03.0F.0A.09.34
```

Read off:

- **home**: should match the panel's Home ID. Ignore frames from other homes.
- **src=1**: the panel. It is the primary controller and almost always node 1. If not, set `panel_node`.
- **dst**: the power unit's node ID. Here `9`.
- **foff**: the frequency offset of your CC1101 module in Hz. Here about +49 kHz.

Mostly the panel's frames show up in this mode. The power unit answers within milliseconds and is usually missed because the radio is still busy receiving. That is expected and the reason the real firmware uses a different receive strategy.

## 3. Fill in the substitutions

**Power unit node and sync byte.** The sync byte is `0xFF` minus the node ID:

| Node ID | `power_unit_node` | `power_unit_sync` |
|---|---|---|
| 2 | `"0x02"` | `"0xFD"` |
| 3 | `"0x03"` | `"0xFC"` |
| 5 | `"0x05"` | `"0xFA"` |
| 9 | `"0x09"` | `"0xF6"` |
| 12 | `"0x0C"` | `"0xF3"` |

**Frequency.** Add the average `foff` to 868.42 MHz and round to kHz:

```
868.420 MHz + 0.049 MHz = 868.469 MHz
```

```yaml
frequency: 868.469MHz
```

After flashing the real firmware, the `RX` log lines show `foff` again. It should now be within about ±10 kHz. If it lands around twice your original offset instead, the sign was wrong: subtract instead of add.

## 4. Verify

With [`example-device.yaml`](../esphome/example-device.yaml) flashed, the log should show a status report within a few seconds of boot:

```
RX src=9 dst=1 rssi=-72 foff=-6348 D4.E3.61.93.09.41.04.1A.01.91.00.04.01.01.03.0A.00.00.00.00.0B.00.00.64.1E.80
```

and the sensors in Home Assistant fill in.

## Optional: exploring with an RTL-SDR

The protocol was first mapped with an RTL-SDR dongle and [waving-z](https://github.com/baol/waving-z), an old but working Z-Wave decoder. On a modern system it builds with:

```
sudo apt install build-essential cmake git rtl-sdr libboost-dev libboost-program-options-dev libboost-test-dev
git clone https://github.com/baol/waving-z
cd waving-z && mkdir build && cd build
cmake -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release ..
make
rtl_sdr -f 868420000 -s 2048000 -g 25 - | ./wave-in -u
```

`-DCMAKE_POLICY_VERSION_MINIMUM=3.5` is needed with CMake 4, and the release build removes an assertion that aborts on strong signals. Keep the dongle away from the panel or lower the gain if frames are cut short.
