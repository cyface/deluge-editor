import { describe, expect, it } from 'vitest'
import { element } from './element'
import { ensureChild, insertChild, removeAttr, removeChild, setAttr } from './edit'
import { serialize } from './generate'

const ORDER = ['a', 'b', 'c', 'd', 'e']

describe('setAttr', () => {
  it('changes an existing attribute in place', () => {
    const el = element('x', { b: '1', d: '2' }, [])
    setAttr(el, 'd', '9', ORDER)
    expect(Object.keys(el.attrs)).toEqual(['b', 'd'])
    expect(el.attrs.d).toBe('9')
  })
  it('inserts a new attribute where the firmware writes it', () => {
    const el = element('x', { a: '1', d: '4', e: '5' }, [])
    setAttr(el, 'c', '3', ORDER)
    expect(Object.keys(el.attrs)).toEqual(['a', 'c', 'd', 'e'])
    setAttr(el, 'b', '2', ORDER)
    expect(Object.keys(el.attrs)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
  it('appends when the name is unknown or no order is given', () => {
    const el = element('x', { b: '1' }, [])
    setAttr(el, 'zz', '1', ORDER)
    setAttr(el, 'a', '1')
    expect(Object.keys(el.attrs)).toEqual(['b', 'zz', 'a'])
  })
  it('never uses an unknown existing key as an anchor', () => {
    // `q` is not in the order: `a` goes before `c`, and `q` stays where the file had it.
    const el = element('x', { q: '0', c: '3' }, [])
    setAttr(el, 'a', '1', ORDER)
    expect(Object.keys(el.attrs)).toEqual(['q', 'a', 'c'])
  })
  it('survives serialisation in the new order', () => {
    const el = element('sound', { c: '3' }, [])
    setAttr(el, 'a', '1', ORDER)
    expect(serialize([el])).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<sound\n\ta="1"\n\tc="3" />\n')
  })
  it('removeAttr drops the attribute', () => {
    const el = element('x', { a: '1', b: '2' }, [])
    removeAttr(el, 'a')
    expect(Object.keys(el.attrs)).toEqual(['b'])
  })
})

describe('ensureChild / insertChild / removeChild', () => {
  it('returns the existing child and does not duplicate it', () => {
    const b = element('b', {}, [])
    const parent = element('p', {}, [b])
    expect(ensureChild(parent, 'b', ORDER)).toBe(b)
    expect(parent.children).toHaveLength(1)
  })
  it('creates a missing child at the firmware position with the given attrs', () => {
    const parent = element('p', {}, [element('a', {}, []), element('d', {}, [])])
    const c = ensureChild(parent, 'c', ORDER, { k: 'v' })
    expect(parent.children.map((x) => x.tag)).toEqual(['a', 'c', 'd'])
    expect(c.attrs).toEqual({ k: 'v' })
    expect(c.children).toEqual([])
  })
  it('unknown tags go last, and are not anchors', () => {
    const parent = element('p', {}, [element('zz', {}, []), element('e', {}, [])])
    insertChild(parent, element('a', {}, []), ORDER)
    insertChild(parent, element('yy', {}, []), ORDER)
    expect(parent.children.map((x) => x.tag)).toEqual(['zz', 'a', 'e', 'yy'])
  })
  it('removeChild removes exactly that element', () => {
    const a1 = element('a', { n: '1' }, [])
    const a2 = element('a', { n: '2' }, [])
    const parent = element('p', {}, [a1, a2])
    removeChild(parent, a1)
    expect(parent.children).toEqual([a2])
  })
})
