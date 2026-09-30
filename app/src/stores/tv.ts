import { defineStore } from "pinia";
import { ref } from "vue";

import { callLuna } from "../luna";
import {
  EMPTY_TV,
  optionsFrom,
  tvId,
  tvPage,
  type TvDef,
  type TvOption,
  type TvRange,
  type TvSnapshot,
} from "../tvSettings";

const SETTINGS = "luna://com.webos.settingsservice";
const AUDIO = "luna://com.webos.audio";
const CONNECTION = "luna://com.webos.service.connectionmanager/getStatus";
const SYSTEM_INFO = "luna://com.webos.service.tv.systemproperty/getSystemInfo";

/** A write waits this long after the last press, so a held slider is one write. */
const WRITE_DELAY_MS = 250;

function ok<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

interface SettingsReply {
  settings?: Record<string, unknown>;
}

interface DescReply {
  results?: {
    key?: string;
    values?: { range?: { min?: number; max?: number; interval?: number } };
  }[];
}

interface ValuesReply {
  values?: { arrayExt?: unknown[] };
}

interface StatusReply {
  wifi?: { state?: string; ssid?: string; ipAddress?: string };
  wired?: { state?: string; ipAddress?: string };
}

/** The TV's settings and system facts, read on demand and written with a short delay. */
export const useTvStore = defineStore("tv", () => {
  const snapshot = ref<TvSnapshot>(EMPTY_TV);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Bumped by every press, so a read that lands after a write cannot undo it. */
  const touched = new Map<string, number>();

  function merge(patch: Partial<TvSnapshot>): void {
    snapshot.value = { ...snapshot.value, ...patch };
  }

  async function readValues(
    category: string,
    keys: readonly string[],
  ): Promise<Record<string, unknown>> {
    if (keys.length === 0) return {};
    try {
      const reply = await callLuna<SettingsReply>(`${SETTINGS}/getSystemSettings`, {
        category,
        keys,
      });
      return reply.settings ?? {};
    } catch {
      // One unreadable key fails the whole call, so read them one at a time.
      const out: Record<string, unknown> = {};
      await Promise.all(
        keys.map(async (key) => {
          try {
            const reply = await callLuna<SettingsReply>(`${SETTINGS}/getSystemSettings`, {
              category,
              keys: [key],
            });
            Object.assign(out, reply.settings ?? {});
          } catch {
            // Left out, and the row reads a dash.
          }
        }),
      );
      return out;
    }
  }

  /**
   * Reads a page's values, the ranges of its sliders and the live options of its
   * choices. Options are asked of the TV because which ones are valid depends on
   * the input, the picture mode and the HDR mode right now.
   */
  async function loadPage(pageId: string): Promise<void> {
    const page = tvPage(pageId);
    if (!page) return;
    const byCategory = new Map<string, TvDef[]>();
    for (const def of page.defs)
      byCategory.set(def.category, [...(byCategory.get(def.category) ?? []), def]);

    const started = new Map(touched);
    const valueJobs = [...byCategory].map(async ([category, defs]) => {
      const read = await readValues(
        category,
        defs.map((def) => def.key),
      );
      const out: Record<string, unknown> = {};
      for (const def of defs) {
        const value = read[def.key];
        if (value !== undefined) out[tvId(def)] = value;
      }
      return out;
    });
    const rangeJobs = [...byCategory].map(async ([category, defs]) => {
      const keys = defs.filter((def) => def.kind === "range").map((def) => def.key);
      const out: Record<string, TvRange> = {};
      if (keys.length === 0) return out;
      try {
        const reply = await callLuna<DescReply>(`${SETTINGS}/getSystemSettingDesc`, {
          category,
          keys,
        });
        for (const entry of reply.results ?? []) {
          const range = entry.values?.range;
          if (entry.key === undefined || range === undefined) continue;
          const { min, max, interval } = range;
          if (typeof min !== "number" || typeof max !== "number") continue;
          out[`${category}.${entry.key}`] = {
            min,
            max,
            step: interval && interval > 0 ? interval : 1,
          };
        }
      } catch {
        // No ranges: those sliders read a dash.
      }
      return out;
    });
    const choiceJobs = page.defs
      .filter((def) => def.kind === "choice" && def.fixed === undefined)
      .map(async (def) => {
        try {
          const reply = await callLuna<ValuesReply>(`${SETTINGS}/getSystemSettingValues`, {
            category: def.category,
            key: def.key,
          });
          return [tvId(def), optionsFrom(reply.values?.arrayExt ?? [])] as const;
        } catch {
          return null;
        }
      });

    const [values, ranges, choices] = await Promise.all([
      Promise.all(valueJobs),
      Promise.all(rangeJobs),
      Promise.all(choiceJobs),
    ]);

    const fresh: Record<string, unknown> = {};
    for (const part of values) {
      for (const [id, value] of Object.entries(part)) {
        // A press since the read began has the newer word.
        if ((touched.get(id) ?? 0) === (started.get(id) ?? 0)) fresh[id] = value;
      }
    }
    const nextChoices: Record<string, readonly TvOption[]> = { ...snapshot.value.choices };
    for (const item of choices) if (item) nextChoices[item[0]] = item[1];
    merge({
      values: { ...snapshot.value.values, ...fresh },
      ranges: Object.assign({}, snapshot.value.ranges, ...ranges),
      choices: nextChoices,
    });
  }

  /** The system facts: model, firmware, network, volume and output. */
  async function loadSystem(): Promise<void> {
    const [volume, status, info, output] = await Promise.allSettled([
      callLuna<{ volume?: number; muteStatus?: boolean }>(`${AUDIO}/getVolume`),
      callLuna<StatusReply>(CONNECTION),
      callLuna<{ modelName?: string; firmwareVersion?: string }>(SYSTEM_INFO, {
        keys: ["modelName", "firmwareVersion"],
      }),
      callLuna<SettingsReply>(`${SETTINGS}/getSystemSettings`, {
        category: "sound",
        keys: ["soundOutput"],
      }),
    ]);
    const wifi = ok(status)?.wifi;
    const wired = ok(status)?.wired;
    const onWired = wired?.state === "connected";
    const onWifi = wifi?.state === "connected";
    const soundOutput = ok(output)?.settings?.["soundOutput"];
    merge({
      volume: ok(volume)?.volume ?? null,
      muted: ok(volume)?.muteStatus === true,
      model: ok(info)?.modelName ?? "",
      firmware: ok(info)?.firmwareVersion ?? "",
      network: onWired ? "Wired" : onWifi ? (wifi?.ssid ?? "Wi-Fi") : "",
      address: (onWired ? wired?.ipAddress : onWifi ? wifi?.ipAddress : "") ?? "",
      output: typeof soundOutput === "string" ? soundOutput : "",
    });
  }

  /**
   * Shows a value at once and writes it after the last press. A write the TV
   * refuses puts the value that was there back.
   */
  function apply(def: TvDef, value: string | number): void {
    const id = tvId(def);
    const before = snapshot.value.values[id];
    touched.set(id, (touched.get(id) ?? 0) + 1);
    merge({ values: { ...snapshot.value.values, [id]: value } });
    const pending = timers.get(id);
    if (pending !== undefined) clearTimeout(pending);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void callLuna(`${SETTINGS}/setSystemSettings`, {
          category: def.category,
          settings: { [def.key]: value },
        }).catch(() => {
          if (snapshot.value.values[id] === value) {
            merge({ values: { ...snapshot.value.values, [id]: before } });
          }
        });
      }, WRITE_DELAY_MS),
    );
  }

  return { snapshot, loadPage, loadSystem, apply };
});
