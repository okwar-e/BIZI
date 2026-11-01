'use strict';
const fs=require('node:fs'),path=require('node:path'),db=require('../config/db');
(async()=>{try{for(const statement of fs.readFileSync(path.join(__dirname,'../config/assistant.sql'),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.query(statement);console.log('Assistant and simulation schema ready.');}catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await db.end();}})();
