'use strict';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
function validateRegistration(role) {
  return (req,res,next) => {
    const body=req.body || {}, errors=[];
    const required=role==='business'?['name','email','businessName']:['name','email','publicHandle'];
    for(const key of required) {
      if(!text(body[key])) errors.push(`${key} is required`);
      else if(body[key].trim().length>255) errors.push(`${key} must be 255 characters or fewer`);
    }
    if(text(body.email) && !emailRegex.test(body.email.trim())) errors.push('email is invalid');
    if(!text(body.password)) errors.push('password is required');
    else if(body.password.trim().length<6) errors.push('password must be at least 6 characters');
    else if(Buffer.byteLength(body.password,'utf8')>72) errors.push('password must fit within 72 UTF-8 bytes');
    if(role==='business' && body.industry!=null && (typeof body.industry!=='string' || body.industry.trim().length>255)) errors.push('industry must be a string of 255 characters or fewer');
    if(errors.length) return res.status(400).json({error:errors.join(', ')});
    return next();
  };
}
function validateLogin(req,res,next) {
  const body=req.body || {},errors=[];
  if(!text(body.email)) errors.push('email is required');
  if(!text(body.password)) errors.push('password is required');
  if(errors.length)return res.status(400).json({error:errors.join(', ')});
  return next();
}
module.exports={validateBusinessRegister:validateRegistration('business'),validateCreatorRegister:validateRegistration('creator'),validateLogin};
