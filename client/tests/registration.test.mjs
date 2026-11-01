import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRegistration, registrationPayload } from '../src/registration.js'
const fields = { name: '  New User ', email: ' TEST@example.test ', password: 'Example123!', confirmPassword: 'Example123!', businessName: ' Business ', industry: ' ', publicHandle: '@creator' }
test('business payload contains only business fields; passwords remain unchanged', () => {
  assert.deepEqual(validateRegistration('business', fields), {})
  assert.deepEqual(registrationPayload('business', { ...fields, role: 'admin', verified: true }), { name: 'New User', email: 'test@example.test', password: 'Example123!', businessName: 'Business', industry: null })
})
test('creator payload omits business details and confirmation', () => {
  assert.deepEqual(validateRegistration('creator', fields), {})
  assert.deepEqual(registrationPayload('creator', fields), { name: 'New User', email: 'test@example.test', password: 'Example123!', publicHandle: '@creator' })
})
test('empty fields, malformed email, mismatched and oversized passwords rejected', () => {
  assert.ok(validateRegistration('business', { ...fields, businessName: ' ' }).businessName)
  assert.ok(validateRegistration('creator', { ...fields, publicHandle: '' }).publicHandle)
  assert.ok(validateRegistration('creator', { ...fields, email: 'invalid' }).email)
  assert.ok(validateRegistration('creator', { ...fields, confirmPassword: 'different' }).confirmPassword)
  assert.ok(validateRegistration('business', { ...fields, password: 'short' }).password)
  assert.ok(validateRegistration('business', { ...fields, password: '🔐'.repeat(20) }).password)
})
test('unsupported roles cannot produce registration payloads', () => {
  assert.ok(validateRegistration('admin', fields).role)
  assert.throws(() => registrationPayload('admin', fields))
})
