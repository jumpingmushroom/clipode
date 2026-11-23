// Where the app is: a screen name and its parameter. `back` returns to the previous route.
import { createContext, createSignal, useContext, type ParentProps } from "solid-js"

export type Route = { name: "inbox" } | { name: "item"; id: string } | { name: "tasks"; filter?: string } | { name: "thread"; id: string } | { name: "run"; id: string } | { name: "agents" } | { name: "agent"; id: string }

function init(initial: Route) {
  const [stack, setStack] = createSignal<Route[]>([initial])
  return {
    current: () => stack().at(-1)!,
    navigate(to: Route) {
      setStack((s) => [...s, to])
    },
    /** Replaces the whole history, for top-level jumps such as "go to inbox". */
    reset(to: Route) {
      setStack([to])
    },
    back() {
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
    },
  }
}

export type Router = ReturnType<typeof init>
const Ctx = createContext<Router>()

export function RouteProvider(props: ParentProps<{ initial?: Route }>) {
  return <Ctx.Provider value={init(props.initial ?? { name: "inbox" })}>{props.children}</Ctx.Provider>
}

export function useRoute(): Router {
  const value = useContext(Ctx)
  if (!value) throw new Error("useRoute needs a RouteProvider")
  return value
}
