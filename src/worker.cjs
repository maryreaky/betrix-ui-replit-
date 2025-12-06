const express = require("express"); const Redis = require("ioredis"); const app = express();
app.use(express.json());
const redis = new Redis(process.env.REDIS_URL,{tls:{rejectUnauthorized:true},maxRetriesPerRequest:5});
redis.on("connect",()=>console.log("? Connected to Redis"));
redis.on("error",(err)=>console.error("? Redis error",err));
app.get("/health",(req,res)=>res.json({status:"ok"}));
app.post("/webhook/telegram",(req,res)=>{console.log("[TELEGRAM] Update received:",req.body);res.sendStatus(200);});
const PORT = process.env.PORT || 10000;
app.listen(PORT,"0.0.0.0",()=>console.log(`BETRIX worker + diagnostics running on ${PORT}`));
