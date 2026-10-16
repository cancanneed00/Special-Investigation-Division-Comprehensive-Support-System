// Preserve optional recognition (null on timeout), while using the same
// cancellation, operation watchdog and adaptive wait as other tasks.
async function legacyRecognize(v,type,param,{attempts=1,delay=500}={}){
 const probe=()=>v.recognize(type,param);
 if(attempts<=1)return probe();
 try{return await v.wait(probe,'危机行动识别 '+(param.expected||param.template),{stable:1,timeout:Math.max(1000,attempts*delay)});}
 catch(error){if(error.code==='RESULT_TIMEOUT')return null;throw error;}
}
module.exports={legacyRecognize};
