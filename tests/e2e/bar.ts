import type { Locator, Page } from '@playwright/test'

/**
 * The top bar's commands live under New / Open / Save dropdowns (issue #37),
 * so reaching one is two clicks. Specs name the item and this finds its menu.
 */
const MENU: Record<string, string> = {
  'new-synth': 'menu-new',
  'new-kit': 'menu-new',
  'randomize-button': 'menu-new',
  'file-open-button': 'menu-open',
  'card-open-button': 'menu-open',
  'download-xml': 'menu-save',
  'download-zip-top': 'menu-save',
  'card-save-button': 'menu-save',
}

function menuOf(item: string): string {
  const menu = MENU[item]
  if (!menu) throw new Error(`no top-bar menu holds ${item}`)
  return menu
}

/** Open the menu that holds `item` and return the item, to look at or click. Escape closes the menu again. */
export async function reveal(page: Page, item: string): Promise<Locator> {
  await page.getByTestId(menuOf(item)).click()
  return page.getByTestId(item)
}

/** Choose a top-bar command: open its menu, click it. */
export async function choose(page: Page, item: string): Promise<void> {
  await (await reveal(page, item)).click()
}
