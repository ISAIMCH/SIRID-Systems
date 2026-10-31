import type { OrganizationNotice } from '../services/api'

const NOTICE_KEY = 'organizationNotice'

// When an open session finds its organization blocked, the login screen shows why after signing out.
export function storeOrganizationNotice(notice: OrganizationNotice) {
  try {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice))
  } catch {
    // Without storage the login screen simply shows the form.
  }
}

export function readOrganizationNotice(): OrganizationNotice | null {
  try {
    return JSON.parse(sessionStorage.getItem(NOTICE_KEY) ?? 'null') as OrganizationNotice | null
  } catch {
    return null
  }
}

export function clearOrganizationNotice() {
  try {
    sessionStorage.removeItem(NOTICE_KEY)
  } catch {
    // Nothing stored.
  }
}
