import { Dict, isCssVar, isObject, pick } from "@chakra-ui/utils"
import analyzeBreakpoints from "./breakpoints"
import type { CSSMap, WithCSSVar } from "./types"

const separator = ">"

const replace = (value: string, str = ".") => value.replace(/>/g, str)

export const toVar = (value: string) => `var(${value})`

export const tokens = [
  "colors",
  "borders",
  "borderWidths",
  "borderStyles",
  "fonts",
  "fontSizes",
  "fontWeights",
  "letterSpacings",
  "lineHeights",
  "radii",
  "space",
  "shadows",
  "sizes",
  "zIndices",
  "transitions",
  "transition.duration",
  "transition.property",
  "transition.easing",
] as const

export type ThemeScale = typeof tokens[number]

function extractTokens(theme: Dict) {
  const _tokens = (tokens as unknown) as string[]
  return pick(theme, _tokens)
}

const getKeys = (key: string) => ({
  varKey: `--${replace(key, "-")}`,
  mapKey: replace(key, "."),
  negVarKey: `--${key.replace(">-", "-")}`,
})

interface AssignOptions {
  cssVars: Dict
  cssMap: CSSMap
  key: any
  value: any
  negate?: boolean
}

function assign(options: AssignOptions) {
  const { cssVars, cssMap, key, value, negate } = options

  const _value = negate ? `-${value}` : value
  const { varKey, mapKey, negVarKey } = getKeys(key)

  if (!negate) {
    cssVars[varKey] = _value
  }

  const _varKey = negate ? negVarKey : varKey
  const minusVal = `calc(${isCssVar(value) ? value : toVar(_varKey)} * -1)`

  const varRef = negate ? minusVal : toVar(varKey)

  cssMap[mapKey] = {
    var: _varKey,
    value: isCssVar(value) ? value : _value,
    varRef,
  }
}

function omitVars(theme: Dict) {
  if ("__cssMap" in theme) {
    delete theme.__cssMap
    delete theme.__cssVars
    delete theme.__breakpoints
  }
}

/**
 * The CSS transform order following the upcoming spec from CSSWG
 * translate => rotate => scale => skew
 * @see https://drafts.csswg.org/css-transforms-2/#ctm
 * @see https://www.stefanjudis.com/blog/order-in-css-transformation-transform-functions-vs-individual-transforms/
 */
const transformTemplate = [
  "rotate(var(--rotate, 0))",
  "scaleX(var(--scale-x, 1))",
  "scaleY(var(--scale-y, 1))",
  "skewX(var(--skew-x, 0))",
  "skewY(var(--skew-y, 0))",
]

export function getTransformTemplate() {
  return [
    "translateX(var(--translate-x, 0))",
    "translateY(var(--translate-y, 0))",
    ...transformTemplate,
  ].join(" ")
}

export function getTransformGpuTemplate() {
  return [
    "translate3d(var(--translate-x, 0), var(--translate-y, 0), 0)",
    ...transformTemplate,
  ].join(" ")
}
export function toCSSVar<T extends Dict>(theme: T) {
  /**
   * In the case the theme has already been converted to css-var (e.g extending the theme),
   * we can omit the computed css vars and recompute it for the extended theme.
   */
  omitVars(theme)

  /**
   * The extracted css variables will be stored here, and used in
   * the emotion's <Global/> component to attach variables to `:root`
   */
  const cssVars: Dict = {
    "--ring-offset": "0px",
    "--ring-color": "rgba(66, 153, 225, 0.6)",
    "--ring-width": "3px",
    "--ring-inset": "var(--empty, /* */)",
    "--ring-offset-shadow":
      "var(--ring-inset) 0 0 0 var(--ring-offset) var(--ring-offset-color, transparent)",
    "--ring-shadow":
      "var(--ring-inset) 0 0 0 calc(var(--ring-width) + var(--ring-offset)) var(--ring-color)",
    "--ring": "var(--ring-offset-shadow), var(--ring-shadow), 0 0 transparent",
    "--transform-gpu": getTransformGpuTemplate(),
    "--transform": getTransformTemplate(),
    "--space-x-reverse": "0",
    "--space-y-reverse": "0",
  }

  /**
   * This is more like a dictionary of tokens users will type `green.500`,
   * and their equivalent css variable.
   */
  const cssMap: CSSMap = {}

  // omit components and breakpoints from css variable map
  const tokens = extractTokens(theme)

  const toProperties = (object: Dict, prevKey?: string) => {
    Object.entries(object).forEach(([key, value]) => {
      value = Array.isArray(value) ? Object.assign({}, value) : value
      // consider using an array format instead of separator
      const newKey = prevKey ? prevKey + separator + key : key

      let negKey: string | number | undefined
      if (newKey.startsWith("space")) {
        negKey = typeof key === "string" ? `-${key}` : -key
        if (!Number.isNaN(negKey) && prevKey) {
          negKey = prevKey + separator + negKey
        }
      }

      if (isObject(value)) {
        toProperties(value, newKey)
        return
      }

      assign({ cssMap, cssVars, key: newKey, value })

      if (negKey) {
        assign({ cssMap, cssVars, key: negKey, value, negate: true })
      }
    })
  }

  toProperties(tokens)

  Object.assign(theme, {
    __cssVars: cssVars,
    __cssMap: cssMap,
    __breakpoints: analyzeBreakpoints(theme.breakpoints),
  })

  return theme as WithCSSVar<T>
}