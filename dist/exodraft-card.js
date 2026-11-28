/*
 * exodraft-card: Lovelace card for the exodraft EW41 ESPHome integration.
 * https://github.com/greberg/exodraft-ew41
 * MIT License. Not affiliated with exodraft a/s.
 */

const CARD_VERSION = "1.2.0";

const DEFAULT_ENTITIES = {
  fan: "switch.{p}_fan",
  speed_setting: "number.{p}_fan_speed_setting",
  temperature: "sensor.{p}_flue_temperature",
  power: "sensor.{p}_fan_power",
  draught: "sensor.{p}_draught",
  setpoint: "sensor.{p}_pressure_setpoint",
  speed: "sensor.{p}_fan_speed",
  mode: "sensor.{p}_operating_mode",
  status: "sensor.{p}_command_status",
};

const SEGMENTS = 12;
const SPEED_DEBOUNCE_MS = 700;
const PENDING_TIMEOUT_MS = 20000;

function ensureFont() {
  if (document.getElementById("exodraft-card-font")) return;
  const link = document.createElement("link");
  link.id = "exodraft-card-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=VT323&display=swap";
  document.head.appendChild(link);
}

class ExodraftCard extends HTMLElement {
  static getStubConfig() {
    return { prefix: "exodraft" };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const prefix = config.prefix || "exodraft";
    const entities = {};
    for (const [key, tpl] of Object.entries(DEFAULT_ENTITIES)) {
      entities[key] = (config.entities && config.entities[key]) || tpl.replace("{p}", prefix);
    }
    this._config = {
      name: config.name ?? "Flue gas fan",
      lock_temperature: Number(config.lock_temperature ?? 50),
      max_temperature: Number(config.max_temperature ?? 300),
      min_speed: Number(config.min_speed ?? 20),
      speed_step: Number(config.speed_step ?? 10),
      show_status: config.show_status !== false,
      entities,
    };
    this._pendingSpeed = null;
    this._pendingSpeedAt = 0;
    this._message = null;
    if (!this._root) this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    this._update();
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    // Height follows the content: the display grows on narrow screens and with the status line.
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  _state(key) {
    return this._hass ? this._hass.states[this._config.entities[key]] : undefined;
  }

  _num(key) {
    const s = this._state(key);
    if (!s || s.state === "unavailable" || s.state === "unknown") return null;
    const n = Number(s.state);
    return Number.isFinite(n) ? n : null;
  }

  _build() {
    ensureFont();
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `
      <style>
        :host {
          --exo-lcd-bg: #1d3fd6;
          --exo-lcd-bg-off: #18307f;
          --exo-lcd-ink: #bfefff;
          --exo-lcd-dim: rgba(191, 239, 255, 0.28);
          --exo-ember: #ff8a2b;
          --exo-ember-hot: #ff4d1f;
          --exo-key-bg: var(--secondary-background-color, #f2f2f2);
          --exo-key-ink: var(--primary-text-color, #1c1c1c);
        }
        ha-card { padding: 16px; }
        .head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
        .name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
        .led { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--secondary-text-color); }
        .led i { width: 8px; height: 8px; border-radius: 50%; background: var(--disabled-text-color, #9e9e9e); }
        .led.on i { background: var(--exo-ember); box-shadow: 0 0 6px var(--exo-ember); }
        .body { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: stretch; }
        .lcd {
          position: relative; border-radius: 6px; padding: 12px 14px 10px;
          background: var(--exo-lcd-bg); color: var(--exo-lcd-ink);
          font-family: "VT323", ui-monospace, "Cascadia Mono", Menlo, monospace;
          line-height: 1; overflow: hidden;
          box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.18), inset 0 0 24px rgba(0, 0, 0, 0.25);
          transition: background 0.4s;
        }
        .lcd.off { background: var(--exo-lcd-bg-off); }
        .lcd::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 3px);
        }
        .row { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
        .temp { font-size: 64px; letter-spacing: 1px; white-space: nowrap; }
        .temp small { font-size: 26px; margin-left: 2px; }
        .mode { font-size: 24px; text-align: right; padding-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bar { display: grid; grid-template-columns: repeat(${SEGMENTS}, 1fr); gap: 3px; margin: 6px 0 10px; height: 12px; }
        .bar span { background: var(--exo-lcd-dim); opacity: 0.45; }
        .bar span.lit { background: var(--exo-lcd-ink); opacity: 1; }
        .bar span.lit.warm { background: var(--exo-ember); }
        .bar span.lit.hot { background: var(--exo-ember-hot); }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
        .grid div { display: flex; flex-direction: column; gap: 2px; white-space: nowrap; }
        .grid .k { color: var(--exo-lcd-dim); font-size: 18px; }
        .grid .v { font-size: 24px; }
        .fanicon { display: inline-block; width: 18px; height: 18px; vertical-align: -2px; margin-right: 4px; }
        .fanicon svg { width: 100%; height: 100%; fill: currentColor; }
        .spin svg { animation: exo-spin 1.2s linear infinite; }
        @keyframes exo-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin svg { animation: none; } }
        .pending { animation: exo-blink 1s steps(2, start) infinite; }
        @keyframes exo-blink { to { visibility: hidden; } }
        @media (prefers-reduced-motion: reduce) { .pending { animation: none; } }
        .keys { display: grid; grid-template-rows: 1fr 1fr 1fr; gap: 8px; min-width: 64px; }
        button {
          font: inherit; font-size: 15px; border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
          border-radius: 10px; background: var(--exo-key-bg); color: var(--exo-key-ink);
          cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 2px; padding: 6px 10px; min-height: 44px;
          transition: transform 0.08s, background 0.2s;
        }
        button:active { transform: translateY(1px); }
        button:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        button[disabled] { opacity: 0.4; cursor: not-allowed; }
        button svg { width: 22px; height: 22px; fill: currentColor; }
        button.power.on { color: var(--exo-ember-hot); border-color: var(--exo-ember); }
        button .lbl { font-size: 12px; color: var(--secondary-text-color); }
        .status { margin: -4px 0 10px; font-size: 13px; color: var(--secondary-text-color); min-height: 18px; }
        .status.warn { color: var(--warning-color, #db8b00); }
        .nosignal { font-size: 30px; text-align: center; padding: 40px 0; }
        @media (max-width: 380px) {
          .temp { font-size: 52px; }
        }
      </style>
      <ha-card>
        <div class="head">
          <span class="name"></span>
          <span class="led"><i></i><span class="ledtxt"></span></span>
        </div>
        <div class="status" aria-live="polite"></div>
        <div class="body">
          <div class="lcd" role="group" aria-label="Fan display">
            <div class="screen">
              <div class="row">
                <div class="temp"><span class="tv">--</span><small>\u00B0C</small></div>
                <div class="mode">--</div>
              </div>
              <div class="bar" aria-hidden="true"></div>
              <div class="grid">
                <div><span class="k"><span class="fanicon"><svg viewBox="0 0 24 24"><path d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm.5-9C17 2 17.1 5.6 14.7 6.8c-1 .5-1.4 1.5-1.6 2.4.5.2.9.5 1.3.9 3.7-2 7.6-1.2 7.6 2.4 0 4.5-3.6 4.6-4.8 2.2-.5-1-1.5-1.4-2.4-1.6-.2.5-.5.9-.9 1.3 2 3.7 1.2 7.6-2.4 7.6-4.5 0-4.6-3.6-2.2-4.8 1-.5 1.4-1.5 1.6-2.4-.5-.2-.9-.5-1.3-.9-3.7 2-7.6 1.2-7.6-2.4 0-4.5 3.6-4.6 4.8-2.2.5 1 1.5 1.4 2.4 1.6.2-.5.5-.9.9-1.3-2-3.7-1.2-7.6 2.4-7.6Z"/></svg></span>speed</span><span class="v sv">--</span></div>
                <div><span class="k">power</span><span class="v pv">--</span></div>
                <div><span class="k">draught</span><span class="v dv">--</span></div>
                <div><span class="k">target</span><span class="v spv">--</span></div>
              </div>
            </div>
            <div class="nosignal" hidden>no signal</div>
          </div>
          <div class="keys">
            <button class="up" aria-label="Increase fan speed">
              <svg viewBox="0 0 24 24"><path d="M12 6 4 18h16z"/></svg>
            </button>
            <button class="power" aria-label="Start or stop the fan">
              <svg viewBox="0 0 24 24"><path d="M11 3h2v9h-2zm6.1 2.3 1.4 1.4A8 8 0 1 1 5.5 6.7l1.4 1.4a6 6 0 1 0 10.2-2.8z"/></svg>
              <span class="lbl plbl">Start</span>
            </button>
            <button class="down" aria-label="Decrease fan speed">
              <svg viewBox="0 0 24 24"><path d="M12 18 4 6h16z"/></svg>
            </button>
          </div>
        </div>
      </ha-card>
    `;
    const $ = (s) => this._root.querySelector(s);
    this._el = {
      name: $(".name"), led: $(".led"), ledtxt: $(".ledtxt"), lcd: $(".lcd"), screen: $(".screen"),
      nosignal: $(".nosignal"), tv: $(".tv"), mode: $(".mode"), bar: $(".bar"), sv: $(".sv"),
      pv: $(".pv"), dv: $(".dv"), spv: $(".spv"), fanicon: $(".fanicon"), up: $(".up"),
      down: $(".down"), power: $(".power"), plbl: $(".plbl"), status: $(".status"),
    };
    for (let i = 0; i < SEGMENTS; i++) this._el.bar.appendChild(document.createElement("span"));
    this._el.up.addEventListener("click", () => this._stepSpeed(+1));
    this._el.down.addEventListener("click", () => this._stepSpeed(-1));
    this._el.power.addEventListener("click", () => this._togglePower());
  }

  _update() {
    if (!this._hass || !this._config || !this._el) return;
    const c = this._config;
    const el = this._el;
    el.name.textContent = c.name;

    const fan = this._state("fan");
    const available = fan && fan.state !== "unavailable" && fan.state !== "unknown";
    el.screen.hidden = !available;
    el.nosignal.hidden = !!available;
    for (const b of [el.up, el.down, el.power]) b.disabled = !available;
    if (!available) {
      el.led.classList.remove("on");
      el.ledtxt.textContent = "Offline";
      el.status.textContent = fan ? "The fan controller is not reachable." : `Entity ${c.entities.fan} not found.`;
      el.status.classList.add("warn");
      return;
    }

    const on = fan.state === "on";
    const temp = this._num("temperature");
    const speed = this._num("speed");
    const setting = this._num("speed_setting");
    const power = this._num("power");
    const draught = this._num("draught");
    const setpoint = this._num("setpoint");
    const modeState = this._state("mode");
    const statusState = this._state("status");

    if (this._pendingSpeed !== null) {
      const settled = setting === this._pendingSpeed && !this._speedTimer;
      const expired = Date.now() - this._pendingSpeedAt > PENDING_TIMEOUT_MS;
      if (settled || expired) this._pendingSpeed = null;
    }

    el.lcd.classList.toggle("off", !on);
    el.led.classList.toggle("on", on);
    el.ledtxt.textContent = on ? "Running" : "Off";
    el.tv.textContent = temp === null ? "--" : Math.round(temp);
    el.mode.textContent = modeState && modeState.state !== "unknown" && modeState.state !== "unavailable"
      ? modeState.state.toLowerCase() : "--";

    const lit = temp === null ? 0 : Math.max(0, Math.min(SEGMENTS, Math.ceil((temp / c.max_temperature) * SEGMENTS)));
    [...el.bar.children].forEach((seg, i) => {
      seg.className = "";
      if (i < lit) {
        seg.classList.add("lit");
        const t = ((i + 1) / SEGMENTS) * c.max_temperature;
        if (t > c.max_temperature * 0.66) seg.classList.add("hot");
        else if (t > c.lock_temperature) seg.classList.add("warm");
      }
    });

    const shownSetting = this._pendingSpeed ?? setting;
    if (this._pendingSpeed !== null) {
      el.sv.innerHTML = `<span class="pending">${this._pendingSpeed}%</span>`;
    } else if (on && speed !== null) {
      el.sv.textContent = `${speed}%`;
    } else {
      el.sv.textContent = shownSetting === null ? "--" : `${shownSetting}%`;
    }
    el.fanicon.classList.toggle("spin", on && (power ?? 0) > 0);
    el.pv.textContent = power === null ? "--" : `${Math.round(power)} W`;
    el.dv.textContent = draught === null ? "--" : `${Math.round(draught)} Pa`;
    el.spv.textContent = setpoint === null ? "--" : `${Math.round(setpoint)} Pa`;

    const locked = on && temp !== null && temp >= c.lock_temperature;
    el.power.classList.toggle("on", on);
    el.plbl.textContent = on ? (locked ? "Locked" : "Stop") : "Start";
    el.power.setAttribute("aria-label", on ? (locked ? "Stop is locked while the flue is hot" : "Stop the fan") : "Start the fan");
    const base = shownSetting ?? c.min_speed;
    el.up.disabled = base >= 100;
    el.down.disabled = base <= c.min_speed;

    let text = "";
    let warn = false;
    if (this._message && Date.now() < this._message.until) {
      text = this._message.text;
      warn = this._message.warn;
    } else if (c.show_status && statusState && !["unknown", "unavailable", ""].includes(statusState.state)) {
      text = statusState.state;
      warn = /blocked|no confirmation|spärrad|ingen bekräftelse/i.test(text);
    }
    el.status.textContent = text;
    el.status.classList.toggle("warn", warn);
  }

  _flash(text, warn = false, ms = 5000) {
    this._message = { text, warn, until: Date.now() + ms };
    this._update();
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => this._update(), ms + 50);
  }

  _stepSpeed(direction) {
    const c = this._config;
    const current = this._pendingSpeed ?? this._num("speed_setting") ?? c.min_speed;
    const next = Math.max(c.min_speed, Math.min(100, current + direction * c.speed_step));
    if (next === current) return;
    this._pendingSpeed = next;
    this._pendingSpeedAt = Date.now();
    this._update();
    clearTimeout(this._speedTimer);
    this._speedTimer = setTimeout(() => {
      this._speedTimer = null;
      this._pendingSpeedAt = Date.now();
      this._hass.callService("number", "set_value", {
        entity_id: c.entities.speed_setting,
        value: next,
      });
    }, SPEED_DEBOUNCE_MS);
  }

  _togglePower() {
    const c = this._config;
    const fan = this._state("fan");
    if (!fan) return;
    const on = fan.state === "on";
    const temp = this._num("temperature");
    if (on && (temp === null || temp >= c.lock_temperature)) {
      this._flash(`Stop is locked until the flue is below ${c.lock_temperature} \u00B0C.`, true);
      return;
    }
    this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: c.entities.fan });
  }
}

customElements.define("exodraft-card", ExodraftCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "exodraft-card",
  name: "Exodraft flue gas fan",
  description: "Display and control an exodraft EW41 flue gas fan through the ESPHome integration.",
  preview: false,
  documentationURL: "https://github.com/greberg/exodraft-ew41",
});

console.info(`%c EXODRAFT-CARD %c ${CARD_VERSION} `, "color:#fff;background:#1d3fd6;padding:2px 4px", "color:#1d3fd6;background:#fff;padding:2px 4px");
