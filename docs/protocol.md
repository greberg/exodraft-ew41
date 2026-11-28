# EW41 radio protocol

Reverse engineered from an EW41 set with panel firmware 88, power unit firmware 44 and a Sigma Designs ZW0301 Z-Wave chip in the panel (PCB header marked *PRO. Z-WAVE*). Everything here was observed on air; nothing comes from exodraft documentation. Field meanings marked *hypothesis* need more observations.

## Physical layer

| Property | Value |
|---|---|
| Frequency | 868.42 MHz (Z-Wave EU) |
| Modulation | 2-FSK, ±20 kHz deviation |
| Data rate | 40 kbps (Z-Wave R2), NRZ |
| Preamble | `0x55` repeated |
| Start of frame | `0xF0` |
| Bit polarity on a CC1101 | Inverted. Z-Wave `0x55 … 0xF0` reads as `0xAA … 0x0F` |

## Frame layout

Classic Z-Wave singlecast (ITU-T G.9959):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | Home ID |
| 4 | 1 | Source node ID |
| 5 | 1 | Frame control 0: `0x41` = singlecast, ack requested; `0x03` = acknowledgement |
| 6 | 1 | Frame control 1: low nibble is a sequence number 1–15 |
| 7 | 1 | Length of the whole frame including checksum |
| 8 | 1 | Destination node ID |
| 9 | n | Payload (command class, command, data) |
| len-1 | 1 | Checksum: `0xFF` XOR every preceding byte |

Example, panel sets speed 30 %:

```
D4 E3 61 93 | 01 | 41 03 | 0D | 09 | 26 01 1E | 44
home ID     src  FC      len  dst  payload    checksum
```

## Nodes

| Node | Role |
|---|---|
| 1 | Panel, primary controller |
| 9 (varies) | Power unit at the chimney |

The panel menus map to Z-Wave functions: *add device* is inclusion, *remove device* is exclusion, the button on the power unit is its learn button.

## Commands

### Speed: Switch Multilevel SET (standard)

```
26 01 vv       vv = speed in percent, 0x14–0x64 (20–100)
```

`26 01 00` and `26 01 FF` are **not** used for stop and start; the power unit ignores them.

### Start and stop: proprietary SET parameter 01

```
91 00 04 01 01 01 01 01    start
91 00 04 01 01 01 01 00    stop
```

### Status request: proprietary GET parameter 0A

```
91 00 04 01 01 02 0A
```

### Status report: proprietary REPORT parameter 0A

Sent by the power unit, 26 byte frame:

```
91 00 04 01 01 03 0A | mm | pp pp | tt tt | dd dd | ss | vv
```

| Payload offset | Frame offset | Field | Unit |
|---|---|---|---|
| 0 | 9 | `0x91` Manufacturer Proprietary | |
| 1–2 | 10–11 | `00 04` manufacturer ID (*hypothesis*: Exhausto, exodraft's former group company) | |
| 3–4 | 12–13 | `01 01` (*hypothesis*: protocol version) | |
| 5 | 14 | Command: `01` SET, `02` GET, `03` REPORT | |
| 6 | 15 | Parameter: `01` on/off, `0A` status | |
| 7 | 16 | Operating mode | see below |
| 8–9 | 17–18 | Fan power, big endian | W |
| 10–11 | 19–20 | Flue temperature, big endian | °C |
| 12–13 | 21–22 | Draught, big endian | Pa |
| 14 | 23 | Pressure setpoint | Pa |
| 15 | 24 | Fan speed | % |

Verified against the panel's fan test screen: 30 %, 26/27 Pa, setpoint 100 Pa, 236 °C, 62 W matched `00 3d | 00 ec | 00 1a | 64 | 1e` in the report.

### Operating mode

| Value | Observed when | Meaning |
|---|---|---|
| 0 | Fan stopped, 0 W | Off |
| 1 | Right after start, 100 % | Start (boost at start-up) |
| 2 | While burning, varying speed | Automatic (*hypothesis*) |
| 3 | While burning, 100 % | Boost or refuelling (*hypothesis*) |
| 4 | After manual speed changes | Manual |
| 11 | Panel shows *Lägg i ved* (add wood), 30 %, flue around 50 °C | Add wood |
| 12 | Panel shows *Efterdrift* (after-run), 30 %, flue around 35 °C while cooling down | After-run |

When the fan is off, the speed field still holds the configured speed.

## Timing

- When the panel's display is awake, the panel asks for status about every 14 seconds. When it sleeps, the interval can exceed 90 seconds.
- The power unit answers a GET within roughly 50–400 ms: first an ACK, then the report.
- Reports are often sent twice, with different sequence numbers. Deduplicate on content.
- Start-up takes about 6 seconds from 0 W to full power.

## Receive strategy on a CC1101

The CC1101's packet mode uses a fixed packet length here, because Z-Wave puts the length byte at offset 7 and the chip expects it first. With a fixed length, the radio keeps receiving after a short frame ends, and a reply that starts within a few milliseconds is missed. Syncing on the start of frame therefore catches the panel but loses the power unit's reports.

The firmware instead syncs on the two bytes `<power unit node> 41` (source node plus frame control of a data frame with ack request). That combination only occurs at offset 4–5 of the power unit's own data frames, so the radio ignores everything else and is ready when a report starts. The firmware puts the home ID and those two bytes back in front of the received data before checking the checksum.

The sync word is inverted like everything else: node 9 and `0x41` become `0xF6 0xBE`.

## Transmit strategy

The CC1101 always transmits its configured sync word after the preamble, which in receive mode is the power unit's `<node> 41`. A Z-Wave receiver does not recognise that as a frame start, so the firmware puts a full Z-Wave preamble and start of frame at the beginning of the data:

```
[chip preamble AA AA AA AA] [chip sync F6 BE] [AA × 10] [0F] [inverted frame] [AA padding to 32 bytes]
```

The power unit sees some noise, then a valid preamble and `0xF0`, and decodes the frame. Frames are sent with the panel's node ID as source. The power unit's ACK goes to the panel, which ignores it.

## Frequency offset

Cheap CC1101 modules can be tens of kHz off. The module used during development was about +49 kHz off at 868.42 MHz, enough for the panel's strong signal to get through but not the power unit's weaker one. The receiver reports its estimate as `freq_offset`; add it to the configured frequency.
