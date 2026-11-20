// Company choice: a screen after sign-in when no company is remembered, and a dialog for switching (leader c).
import { useRenderer } from "@opentui/solid"
import { useBindings } from "@opentui/keymap/solid"
import { useRoute } from "../route.tsx"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { DialogSelect } from "../ui/dialog-select.tsx"
import { Wordmark } from "../ui/wordmark.tsx"

function CompanySelect(props: { mode: "base" | "modal"; onChosen?: () => void }) {
  const { session } = useStores()
  return (
    <DialogSelect
      title="Companies"
      mode={props.mode}
      current={session.state.companyId ?? undefined}
      options={session.state.companies.map((c) => ({
        title: c.name,
        value: c.id,
        footer: c.id === session.state.companyId ? "current" : (c.prefix ?? undefined),
      }))}
      onSelect={(option) => {
        session.selectCompany(option.value)
        props.onChosen?.()
      }}
    />
  )
}

export function CompanyPickerScreen() {
  const { theme } = useTheme()
  const renderer = useRenderer()
  useBindings(() => ({ mode: "base", bindings: [{ key: "ctrl+c", cmd: () => renderer.destroy() }] }))
  return (
    <box width="100%" height="100%" backgroundColor={theme().background} alignItems="center" justifyContent="center" flexDirection="column">
      <Wordmark theme={theme()} />
      <box marginTop={2} width={60} backgroundColor={theme().panel} paddingTop={1} paddingBottom={1}>
        <CompanySelect mode="base" />
      </box>
    </box>
  )
}

export function useCompanyDialog() {
  const dialog = useDialog()
  const route = useRoute()
  return () =>
    dialog.replace(() => (
      <CompanySelect
        mode="modal"
        onChosen={() => {
          dialog.clear()
          route.reset({ name: "inbox" })
        }}
      />
    ))
}
