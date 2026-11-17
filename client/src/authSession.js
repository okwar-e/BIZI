export const sessionRoles = ['business', 'creator', 'admin']

export function dashboardPathForRole(role) {
  if (role === 'creator') return '/creator/dashboard'
  if (role === 'business' || role === 'admin') return '/'
  throw new Error('Unsupported account role.')
}
