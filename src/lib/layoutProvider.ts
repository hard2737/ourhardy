/**
 * Centralized layout/theme resolution for shared UI surfaces (login, etc.).
 * Maps a layout name to CSS class names and display strings.
 *
 * Usage:
 *   const layout = LayoutProvider.fromPath("/wod/setup")
 *   <div className={styles[layout.root]}>
 */

export type LayoutName = "aux" | "wod"

interface LayoutConfig {
  name: LayoutName
  /** Display title shown in the logo/header */
  title: string
  /** CSS module class name keys — use as styles[layout.root], etc. */
  root: string
  box: string
  logo: string
}

const LAYOUTS: Record<LayoutName, LayoutConfig> = {
  aux: {
    name: "aux",
    title: "aux",
    root: "root",
    box: "box",
    logo: "logo",
  },
  wod: {
    name: "wod",
    title: "SmartWOD",
    root: "rootWod",
    box: "boxWod",
    logo: "logoWod",
  },
}

export class LayoutProvider {
  /** Resolve layout from a redirect path (e.g. "/wod", "/wod/setup", "/aux"). */
  static fromPath(path: string): LayoutConfig {
    if (path.startsWith("/wod")) return LAYOUTS.wod
    return LAYOUTS.aux
  }

  /** Resolve layout by explicit name. */
  static fromName(name: LayoutName): LayoutConfig {
    return LAYOUTS[name] ?? LAYOUTS.aux
  }

  /** Register a new layout at runtime (for future expansion). */
  static register(name: LayoutName, config: LayoutConfig) {
    LAYOUTS[name] = config
  }
}
