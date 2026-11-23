// Sign-in: instance URL, email and password in a centred panel under the wordmark. The password stays in memory.
import { TextAttributes, type BoxRenderable, type InputRenderable, type KeyEvent, type PasteEvent } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useRenderer } from "@opentui/solid"
import { createSignal, For, onMount, Show } from "solid-js"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Wordmark } from "../ui/wordmark.tsx"

const FIELDS = ["url", "email", "password"] as const
type Field = (typeof FIELDS)[number]
const LABELS: Record<Field, string> = { url: "Instance URL", email: "Email", password: "Password" }
const WIDTH = 46

export function SignInScreen(props: { version: string }) {
  const { theme } = useTheme()
  const { session } = useStores()
  const renderer = useRenderer()
  const [url, setUrl] = createSignal(session.state.url)
  const [email, setEmail] = createSignal(session.state.email)
  const [password, setPassword] = createSignal("")
  const [focus, setFocus] = createSignal<Field>(session.state.url ? (session.state.email ? "password" : "email") : "url")
  const refs: Partial<Record<Field, InputRenderable | BoxRenderable>> = {}

  const focusField = (field: Field) => {
    setFocus(field)
    refs[field]?.focus()
  }
  onMount(() => setTimeout(() => focusField(focus()), 1))

  const step = (delta: number) => focusField(FIELDS[(FIELDS.indexOf(focus()) + delta + FIELDS.length) % FIELDS.length]!)
  const submit = () => {
    if (session.state.status === "signing-in") return
    // Email and password go together; both empty tries a local instance that needs no sign-in.
    if (!url() || !!email() !== !!password()) return focusField(!url() ? "url" : !email() ? "email" : "password")
    const pw = password()
    setPassword("")
    void session.signIn(url().trim(), email().trim(), pw)
  }

  useBindings(() => ({
    bindings: [
      { key: "tab,down", cmd: () => step(1) },
      { key: "shift+tab,up", cmd: () => step(-1) },
      { key: "return", cmd: submit },
      { key: "ctrl+c", cmd: () => renderer.destroy() },
    ],
  }))

  const onPasswordKey = (key: KeyEvent) => {
    if (key.name === "backspace") setPassword((p) => p.slice(0, -1))
    else if (!key.ctrl && !key.meta && key.sequence.length === 1 && key.sequence >= " ") setPassword((p) => p + key.sequence)
  }

  const value = (field: Field) => (field === "url" ? url() : email())
  const setValue = (field: Field, v: string) => (field === "url" ? setUrl(v) : setEmail(v))

  return (
    <box width="100%" height="100%" backgroundColor={theme().background} alignItems="center" justifyContent="center" flexDirection="column">
      <Wordmark theme={theme()} />
      <text fg={theme().muted} marginTop={1}>
        a terminal client for Paperclip
      </text>
      <box marginTop={2} width={WIDTH + 4} backgroundColor={theme().panel} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} flexDirection="column">
        <text fg={theme().text} attributes={TextAttributes.BOLD}>
          Sign in
        </text>
        <For each={FIELDS}>
          {(field) => (
            <box flexDirection="column" marginTop={1}>
              <text fg={focus() === field ? theme().accent : theme().muted}>{LABELS[field]}</text>
              <Show
                when={field === "password"}
                fallback={
                  <input
                    ref={(r: InputRenderable) => (refs[field] = r)}
                    value={value(field)}
                    onInput={(v: string) => setValue(field, v)}
                    onMouseDown={() => focusField(field)}
                    width={WIDTH}
                    paddingLeft={1}
                    backgroundColor={theme().background}
                    focusedBackgroundColor={theme().background}
                    textColor={theme().text}
                    focusedTextColor={theme().text}
                    cursorColor={theme().accent}
                    placeholder={field === "url" ? "https://paperclip.example.com" : "you@example.com"}
                    placeholderColor={theme().muted}
                  />
                }
              >
                <box
                  ref={(r: BoxRenderable) => (refs.password = r)}
                  focusable
                  onKeyDown={onPasswordKey}
                  onPaste={(e: PasteEvent) => setPassword((p) => p + new TextDecoder().decode(e.bytes).replace(/[\r\n]/g, ""))}
                  onMouseDown={() => focusField("password")}
                  width={WIDTH}
                  height={1}
                  paddingLeft={1}
                  backgroundColor={theme().background}
                >
                  <text fg={theme().text}>
                    {"•".repeat(password().length)}
                    <Show when={focus() === "password"}>
                      <span style={{ fg: theme().accent }}>█</span>
                    </Show>
                  </text>
                </box>
              </Show>
            </box>
          )}
        </For>
        <box marginTop={1} flexDirection="column" minHeight={2}>
          <Show when={session.state.status === "signing-in"}>
            <box flexDirection="row">
              <Spinner color={theme().accent} />
              <text fg={theme().muted}> signing in</text>
            </box>
          </Show>
          <Show when={session.state.status !== "signing-in" && session.state.error}>
            <text fg={theme().error}>✗ {session.state.error}</text>
          </Show>
        </box>
        <text fg={theme().text} marginTop={1}>
          tab <span style={{ fg: theme().muted }}>next field</span>   enter <span style={{ fg: theme().muted }}>sign in</span>   ctrl+c{" "}
          <span style={{ fg: theme().muted }}>quit</span>
        </text>
      </box>
      <box position="absolute" bottom={0} right={1}>
        <text fg={theme().muted}>clipode {props.version}</text>
      </box>
    </box>
  )
}
