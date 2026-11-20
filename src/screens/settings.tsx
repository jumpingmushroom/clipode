// Settings: where clipode is connected and how it looks, with shortcuts to change the company, theme and sidebar.
import { join } from "node:path"
import { configDir } from "../config.ts"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { defaultThemeName } from "../theme/registry.ts"
import { useDialog } from "../ui/dialog.tsx"
import { DialogSelect } from "../ui/dialog-select.tsx"
import { openThemeDialog } from "../ui/dialog-theme.tsx"

type Action = "company" | "theme" | "sidebar" | "signout" | "none"

export function SettingsDialog(props: { sidebar: boolean; toggleSidebar: () => void; openCompanies: () => void; version: string }) {
  const { session, company } = useStores()
  const theme = useTheme()
  const dialog = useDialog()
  const companyName = () => session.state.companies.find((c) => c.id === company()?.companyId)?.name ?? "—"
  const options: { title: string; value: Action; category: string; footer: string }[] = [
    { title: "Instance", value: "none", category: "Session", footer: session.host() },
    { title: "Signed in as", value: "none", category: "Session", footer: session.state.userName ?? "—" },
    { title: "Company", value: "company", category: "Session", footer: companyName() },
    { title: "Sign out", value: "signout", category: "Session", footer: "" },
    { title: "Theme", value: "theme", category: "View", footer: (theme.name() ?? defaultThemeName(theme.mode())).replace(/^clipode-/, "clipode ") },
    { title: "Sidebar", value: "sidebar", category: "View", footer: props.sidebar ? "shown" : "hidden" },
    { title: "Config file", value: "none", category: "About", footer: join(configDir(), "cli.json") },
    { title: "Version", value: "none", category: "About", footer: props.version },
  ]
  return (
    <DialogSelect
      title="Settings"
      options={options}
      onSelect={(o) => {
        if (o.value === "none") return
        dialog.clear()
        if (o.value === "company") props.openCompanies()
        else if (o.value === "theme") openThemeDialog(dialog, theme)
        else if (o.value === "sidebar") props.toggleSidebar()
        else if (o.value === "signout") void session.signOut()
      }}
    />
  )
}
