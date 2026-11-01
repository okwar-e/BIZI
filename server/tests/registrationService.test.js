const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationService } = require('../services/registrationService');
const fields={name:' New User ',email:' TEST@EXAMPLE.TEST ',password:'test-password',businessName:' Business ',industry:' ',publicHandle:' @creator '};
function fixture(failure) {
  const operations=[];
  const connection={beginTransaction:async()=>operations.push('begin'),commit:async()=>operations.push('commit'),rollback:async()=>operations.push('rollback'),release:()=>operations.push('release'),query:async(sql,params)=>{
    operations.push({sql,params});
    if((failure==='duplicate'&&sql.includes('users')) || (failure==='account'&&!sql.includes('users')))throw Object.assign(new Error('failed'),{code:failure==='duplicate'?'ER_DUP_ENTRY':'ER_TEST'});
    return [{insertId:sql.includes('users')?11:22}];
  }};
  return {operations,register:createRegistrationService({db:{getConnection:async()=>connection},hashPassword:async()=> 'hashed-test-value'})};
}
test('business account and user commit together, with fixed role and normalized fields',async()=>{
  const {register,operations}=fixture();assert.deepEqual(await register('business',fields),{userId:11,businessId:22});
  assert.deepEqual(operations[1].params,['New User','test@example.test','hashed-test-value','business']);
  assert.deepEqual(operations[2].params,[11,'Business',null]);assert.deepEqual(operations.slice(-2),['commit','release']);
});
test('creator account uses creator table and fixed creator role',async()=>{
  const {register,operations}=fixture();assert.deepEqual(await register('creator',fields),{userId:11,creatorId:22});
  assert.match(operations[2].sql,/creators/);assert.deepEqual(operations[2].params,[11,'@creator']);
});
test('account-insert failure rolls back user; duplicate email also rolls back and releases',async()=>{
  for(const failure of ['account','duplicate']){const {register,operations}=fixture(failure);await assert.rejects(register('business',fields));assert.deepEqual(operations.slice(-2),['rollback','release']);assert.ok(!operations.includes('commit'));}
});
test('caller cannot register an administrator',async()=>{
  const {register,operations}=fixture();await assert.rejects(register('admin',fields));assert.equal(operations.length,0);
});
