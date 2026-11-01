'use strict';
const express=require('express');
const db=require('../config/db');
const {verifyToken}=require('../middleware/authMiddleware');
const {createOpenRouter}=require('../services/openRouterService');
const {chat}=require('../services/biziAssistant');
const {propose,confirm,toolsFor}=require('../services/assistantActions');
const {uuid}=require('../services/recommendationValidation');
const methodology=require('../services/recommendationMethodology');
const router=express.Router();
const rate=new Map();
router.get('/methodology',(_req,res)=>res.json(methodology));
router.use(verifyToken);
router.use(async(req,res,next)=>{
 try{
  const [users]=await db.query('SELECT role FROM users WHERE userId=?',[req.user.userId]);
  if(!users.length||!['business','creator'].includes(users[0].role))return res.status(403).json({error:'Assistant is available to businesses and creators'});
  req.actor={userId:req.user.userId,role:users[0].role};
  const now=Date.now(),key=req.actor.userId,old=rate.get(key);
  if(rate.size>2000)for(const [k,v]of rate)if(v.until<=now)rate.delete(k);
  const bucket=old&&old.until>now?old:{count:0,until:now+60000};bucket.count++;rate.set(key,bucket);
  if(bucket.count>20)return res.status(429).json({error:'Please wait a minute before making more assistant requests'});
  return next();
 }catch{res.status(500).json({error:'Assistant unavailable'});}
});
router.get('/status',(req,res)=>res.json({...createOpenRouter().status(),role:req.actor.role,actions:toolsFor(req.actor.role).map(t=>t.function),mode:'preview_then_confirm'}));
router.post('/chat',async(req,res)=>{
 const {question,context={}}=req.body||{};
 if(typeof question!=='string'||!question.trim()||question.length>2000||!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!['campaignId','runId'].includes(k))||(context.campaignId!==undefined&&(!Number.isInteger(context.campaignId)||context.campaignId<=0))||(context.runId!==undefined&&!uuid(context.runId)))return res.status(400).json({error:'Invalid question or context'});
 if(req.actor.role!=='business'&&Object.keys(context).length)return res.status(403).json({error:'Campaign context is only available to businesses'});
 try{res.json(await chat({db,provider:createOpenRouter(),actor:req.actor,question:question.trim(),context}));}
 catch(e){res.status(e.status||500).json({error:e.status?e.message:'Assistant unavailable'});}
});
router.post('/proposals',async(req,res)=>{
 try{res.status(201).json(await propose({db,actor:req.actor,name:req.body?.action,args:req.body?.arguments}));}
 catch(e){res.status(e.status||500).json({error:e.status?e.message:'Could not prepare action'});}
});
router.post('/proposals/:proposalId/confirm',async(req,res)=>{
 if(!uuid(req.params.proposalId)||req.body?.confirm!==true)return res.status(400).json({error:'Explicit confirmation is required'});
 try{res.json(await confirm({db,actor:req.actor,proposalId:req.params.proposalId}));}
 catch(e){res.status(e.status||500).json({error:e.status?e.message:'Action failed; no changes were committed'});}
});
router.post('/proposals/:proposalId/cancel',async(req,res)=>{
 if(!uuid(req.params.proposalId))return res.status(400).json({error:'Invalid proposal id'});
 try{const [r]=await db.query('UPDATE assistant_proposals SET status=? WHERE proposalId=? AND actorId=? AND status=?',['cancelled',req.params.proposalId,req.actor.userId,'pending']);if(!r.affectedRows)return res.status(404).json({error:'Pending proposal not found'});res.json({cancelled:true});}
 catch{res.status(500).json({error:'Cancellation failed'});}
});
module.exports=router;
