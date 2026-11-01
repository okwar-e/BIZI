const roles = ['business', 'creator']
export function validateRegistration(role, fields) {
  const errors = {}
  if (!roles.includes(role)) errors.role = 'Choose Business or Creator.'
  const required = { name: 'Your name', email: 'Email address', ...(role === 'business' ? { businessName: 'Business name' } : { publicHandle: 'Public handle' }) }
  for (const [key, label] of Object.entries(required)) {
    if (typeof fields[key] !== 'string' || !fields[key].trim()) errors[key] = `${label} is required.`
    else if (fields[key].trim().length > 255) errors[key] = `${label} must be 255 characters or fewer.`
  }
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) errors.email = 'Enter a valid email address.'
  if (typeof fields.password !== 'string' || fields.password.trim().length < 6) errors.password = 'Use at least 6 characters.'
  else if (new TextEncoder().encode(fields.password).length > 72) errors.password = 'Password must fit within 72 UTF-8 bytes. Use fewer characters.'
  if (fields.confirmPassword !== fields.password) errors.confirmPassword = 'Passwords do not match.'
  if (role === 'business' && fields.industry && fields.industry.trim().length > 255) errors.industry = 'Industry must be 255 characters or fewer.'
  return errors
}
export function registrationPayload(role, fields) {
  if (!roles.includes(role)) throw new Error('Choose a supported account type.')
  const common = { name: fields.name.trim(), email: fields.email.trim().toLowerCase(), password: fields.password }
  return role === 'business' ? { ...common, businessName: fields.businessName.trim(), industry: fields.industry.trim() || null } : { ...common, publicHandle: fields.publicHandle.trim() }
}
