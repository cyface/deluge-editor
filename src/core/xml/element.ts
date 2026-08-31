/**
 * The in-memory form of a Deluge XML file: an ordered tree of elements whose
 * attribute values are the file's own strings.
 *
 * Why strings: the Deluge writes every value as text — `0x7FFFFFFF` params,
 * `-12` transposes, `1` for booleans, enum names — and its reader takes a
 * value equally from an attribute (`<osc1 type="saw">`) or from a child
 * element with text (`<osc1><type>saw</type></osc1>`, the pre-3.0 format).
 * Keeping the text form is what lets a loaded value round-trip untouched
 * whether or not the UI ever looks at it. Convert at the edge:
 * `hexToInt`/`intToHex` for params, `Number`/`String` for plain integers.
 *
 * Attribute order is the key order of `attrs`; element order is `children`
 * order. Both are exactly what the file had, and the generator writes them
 * back in that order. Anything the editor does not model is still in here,
 * in place, and comes back out where it was.
 *
 * The typed shapes in `src/core/preset/types.ts` are views over this: they
 * name the attributes and child tags the firmware writes, so the UI can bind
 * to `child(sound, 'osc1').attrs.type` without casts.
 */

export type Attrs = { [name: string]: string | undefined }
export type ChildMap = { [tag: string]: XmlElement }

export interface XmlElement<A extends Attrs = Attrs, C extends ChildMap = ChildMap> {
  tag: string
  attrs: A
  children: XmlElement[]
  /** Type-level only: the child tags this element is known to carry. Never present at runtime. */
  readonly __children?: C
}

export function element<A extends Attrs = Attrs, C extends ChildMap = ChildMap>(
  tag: string,
  attrs: A = {} as A,
  children: XmlElement[] = [],
): XmlElement<A, C> {
  return { tag, attrs, children }
}

/** The first child with this tag, typed by the parent's child map. */
export function child<C extends ChildMap, K extends keyof C & string>(
  el: XmlElement<Attrs, C>,
  tag: K,
): C[K] | undefined {
  return el.children.find((c) => c.tag === tag) as C[K] | undefined
}

/** Every child with this tag, in document order. */
export function childrenOf<C extends ChildMap, K extends keyof C & string>(
  el: XmlElement<Attrs, C>,
  tag: K,
): C[K][] {
  return el.children.filter((c) => c.tag === tag) as C[K][]
}

/** A deep copy sharing nothing with the original, keeping attribute and child order. */
export function cloneElement<A extends Attrs, C extends ChildMap>(el: XmlElement<A, C>): XmlElement<A, C> {
  return { tag: el.tag, attrs: { ...el.attrs }, children: el.children.map((c) => cloneElement(c)) }
}
