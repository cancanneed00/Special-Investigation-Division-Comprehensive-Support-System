const fs=require('fs');
const {randomUUID}=require('crypto');
const RETRYABLE=new Set(['EPERM','EACCES','EBUSY']);
const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);

// UI telemetry must never turn a successful game action into a task failure.
// Keep atomic replacement: readers see either the old or the complete new JSON.
function createStatusWriter(file,{io=fs,pause=sleep,onWarning=console.warn,delays=[10,20,40,80,160,320]}={}) {
  const token=process.pid+'-'+randomUUID();let sequence=0,warned=false;
  return value=>{
    const temporary=file+'.'+token+'.'+(++sequence)+'.tmp';
    try {
      const data=JSON.stringify({...value,updatedAt:new Date().toISOString()},null,2);
      for(let attempt=0;;attempt++) {
        try {
          io.writeFileSync(temporary,data,'utf8');
          io.renameSync(temporary,file);
          warned=false;return true;
        }catch(error) {
          if(!RETRYABLE.has(error.code)||attempt>=delays.length)throw error;
          // At most 630ms, in the worker only; does not occupy CPU or block the UI.
          pause(delays[attempt]);
        }
      }
    }catch(error) {
      if(!warned){warned=true;try{onWarning(`界面状态更新暂不可用（${error.code||error.message}），任务继续；请查看运行日志。`);}catch(_){} }
      return false;
    }finally {
      try{io.unlinkSync(temporary);}catch(_){}
    }
  };
}
module.exports={createStatusWriter};
