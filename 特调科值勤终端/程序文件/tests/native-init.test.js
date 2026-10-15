const {test}=require('node:test');
const assert=require('node:assert/strict');
const maa=require('../node_modules/@maaxyz/maa-node');
const {Session}=require('../lib/session');

test('production initialization accepts the actual native Global API',async()=>{
  let enumerated=false;
  // Exercise every production Global setter against the real native binding.
  // Only window enumeration is replaced: this test never connects to the game.
  const session=new Session({Global:maa.Global,Win32Controller:{find:async()=>{enumerated=true;return [];}}});
  try {
    await assert.rejects(session.connect(),/当前找到 0 个/);
    assert.equal(enumerated,true);
  }finally{await session.close();}
});

test('provider and device values work with actual native Resource setters',()=>{
  const resource=new maa.Resource();
  try {
    for(const provider of ['Auto','CPU','DirectML']) {
      resource.inference_device=provider==='CPU'?'CPU':'Auto';
      resource.inference_execution_provider=provider;
    }
  }finally{resource.destroy();}
});
